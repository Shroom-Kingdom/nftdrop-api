import { Router } from 'itty-router';
import { Account, connect, KeyPair, keyStores } from 'near-api-js';

import { logErrorResponse } from './helpers';

export interface NearUser {
  walletId: string;
  points: number;
  level: number;
  staked: boolean;
  creditToNextLevel: number;
  requiredToNextLevel: number;
}

export function isNearUserOk(user: NearUser): boolean {
  return !!user.walletId && user.level >= 2 && user.staked;
}

export async function nearLogin(walletKey: string): Promise<Account> {
  const keyStore = new keyStores.InMemoryKeyStore();
  const keyPair = KeyPair.fromString(walletKey);
  keyStore.setKey('testnet', 'near-chan-v5.shrm.testnet', keyPair);
  const config = {
    networkId: 'testnet',
    keyStore,
    nodeUrl: 'https://rpc.testnet.near.org',
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
    explorerUrl: 'https://explorer.testnet.near.org',
    headers: {}
  };
  const near = await connect(config);
  const account = new Account(near.connection, 'testnet');
  return account;
}

const router = Router({ base: '/near' });
export { router as nearRouter };

router.get('/:walletId', async (req, env: Env) => {
  const walletId = req.params?.walletId;
  if (walletId == null) {
    return new Response('', { status: 400 });
  }

  const levelRes = await getLevel(walletId);
  if (levelRes instanceof Response) {
    return Response;
  }
  const { points, level, creditToNextLevel, requiredToNextLevel } = levelRes;

  const stakeRes = await getStakeBadge(walletId);
  if (stakeRes instanceof Response) {
    return Response;
  }
  const staked = stakeRes;

  const user: NearUser = {
    walletId,
    points,
    level,
    staked,
    creditToNextLevel,
    requiredToNextLevel
  };

  const addr = env.NEAR.idFromName(user.walletId);
  const obj = env.NEAR.get(addr);
  const objRes = await obj.fetch(req.url, {
    method: 'PUT',
    body: JSON.stringify(user)
  });
  if (!objRes.ok) {
    console.error('Near DO', await objRes.text());
    return new Response('', { status: 400 });
  }

  return new Response(JSON.stringify(user));
});

async function getLevel(walletId: string): Promise<
  | {
      points: number;
      level: number;
      requiredToNextLevel: number;
      creditToNextLevel: number;
    }
  | Response
> {
  const res = await fetch(
    `https://api.stats.gallery/testnet/score-calculate?account_id=${walletId}`
  );
  if (!res.ok) {
    logErrorResponse('GET Near level', res);
    return new Response('', { status: 400 });
  }
  const pointsRes: { result: number }[] = await res.json();
  const { result: points } = pointsRes.pop() ?? { result: 0 };
  const { level, requiredToNextLevel, creditToNextLevel } =
    pointsToLevel(points);
  return { points, level, requiredToNextLevel, creditToNextLevel };
}

async function getStakeBadge(walletId: string): Promise<boolean | Response> {
  const res = await fetch(
    `https://api.stats.gallery/testnet/badge-stake?account_id=${walletId}`
  );
  if (!res.ok) {
    logErrorResponse('GET Near stake badge', res);
    return new Response('', { status: 400 });
  }
  const stakeRes: { result: number }[] = await res.json();
  const { result } = stakeRes.pop() ?? { result: 0 };
  return result === 1;
}

function pointsToLevel(points: number): {
  level: number;
  requiredToNextLevel: number;
  creditToNextLevel: number;
} {
  const level = Math.log2((points + 100) / 100) | 0;
  const totalPointsToCurrentLevel = 2 ** level * 100 - 100;
  const totalPointsToNextLevel = 2 ** (level + 1) * 100;
  return {
    level: level + 1,
    requiredToNextLevel: totalPointsToNextLevel - totalPointsToCurrentLevel,
    creditToNextLevel: points - totalPointsToCurrentLevel
  };
}

export class Near {
  private state: DurableObjectState;
  private initializePromise: Promise<void> | undefined;
  private user?: NearUser | null;
  private router: Router<unknown>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.user = null;
    this.router = Router()
      .get('/nftdrop/*', async () => {
        if (!this.user || !isNearUserOk(this.user)) {
          return new Response('', { status: 403 });
        }
        return new Response('', { status: 200 });
      })
      .get('*', async () => {
        if (this.user) {
          return new Response(JSON.stringify(this.user));
        }
        return new Response('', { status: 404 });
      })
      .put('*', async req => {
        if (!req.json) {
          return new Response('', { status: 400 });
        }
        const user: NearUser = await req.json();
        this.user = user;
        this.state.storage.put('user', user);
        return new Response('', { status: 204 });
      });
  }

  async initialize(): Promise<void> {
    this.user = await this.state.storage.get('user');
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.initializePromise) {
      this.initializePromise = this.initialize().catch(err => {
        this.initializePromise = undefined;
        throw err;
      });
    }
    await this.initializePromise;

    return this.router.handle(request);
  }
}
