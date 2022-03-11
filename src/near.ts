import { Router } from 'itty-router';
import { Account, connect, Contract, KeyPair, keyStores } from 'near-api-js';

import { logErrorResponse } from './helpers';

export interface NearUser {
  walletId: string;
  points: number;
  level: number;
  staked: boolean;
  creditToNextLevel: number;
  requiredToNextLevel: number;
  createdAt: number;
}

export interface NftContract extends Contract {
  nft_metadata: ContractViewCall<unknown, { base_uri?: string }>;
  nft_tokens_for_owner: ContractViewCall<
    {
      account_id: string;
      from_index: string;
      limit: number;
    },
    NftMetadata[]
  >;
  nft_unclaimed_airdrop_tokens: ContractViewCall<
    {
      from_index: string;
      limit: number;
    },
    string
  >;
  nft_token: ContractViewCall<
    {
      token_id: string;
    },
    NftMetadata
  >;
  nft_approve: ContractChangeCall<{
    account_id: string;
    token_id: string;
    msg?: string;
  }>;
  nft_revoke: ContractChangeCall<{ token_id: string; account_id: string }>;
}

type ContractViewCall<T, R> = (params?: T) => Promise<R>;

type ContractChangeCall<T> = (params: {
  args: T;
  gas?: string;
  amount?: string;
}) => Promise<void>;

export interface NftMetadata {
  token_id: string;
  approved_account_ids: Record<string, number>;
  metadata: {
    media: string;
  };
}

export function isNearUserOk(user: NearUser, dateThreshold: string): boolean {
  return (
    !!user.walletId &&
    user.level >= 3 &&
    user.staked &&
    new Date(user.createdAt).valueOf() < new Date(dateThreshold).valueOf()
  );
}

export async function initContract(
  walletKey: string,
  env: Env
): Promise<NftContract> {
  const keyStore = new keyStores.InMemoryKeyStore();
  const keyPair = KeyPair.fromString(walletKey);
  keyStore.setKey(env.NETWORK_ID, env.CONTRACT_ID, keyPair);
  const config = {
    networkId: env.NETWORK_ID,
    keyStore,
    nodeUrl: env.NODE_URL,
    walletUrl: env.WALLET_URL,
    helperUrl: env.HELPER_URL,
    explorerUrl: env.EXPLORER_URL,
    headers: {}
  };
  const near = await connect(config);
  const account = new Account(near.connection, env.CONTRACT_ID);
  const contract = new Contract(account, env.CONTRACT_ID, {
    changeMethods: ['nft_approve', 'nft_revoke'],
    viewMethods: [
      'nft_metadata',
      'nft_tokens_for_owner',
      'nft_token',
      'nft_unclaimed_airdrop_tokens'
    ]
  }) as NftContract;
  return contract;
}

const router = Router({ base: '/near' });
export { router as nearRouter };

router.get('/:walletId', async (req, env: Env) => {
  const walletId = req.params?.walletId;
  if (walletId == null) {
    return new Response('', { status: 400 });
  }

  const levelRes = await getLevel(walletId, env);
  if (levelRes instanceof Response) {
    return Response;
  }
  const { points, level, creditToNextLevel, requiredToNextLevel } = levelRes;

  const stakeRes = await getStakeBadge(walletId, env);
  if (stakeRes instanceof Response) {
    return Response;
  }
  const staked = stakeRes;

  const createdRes = await getCreatedAt(walletId, env);
  if (createdRes instanceof Response) {
    return Response;
  }
  const createdAt = createdRes;

  const user: NearUser = {
    walletId,
    points,
    level,
    // workaround for wrong api result on testnet for staking
    staked: env.NETWORK_ID === 'testnet' ? true : staked,
    creditToNextLevel,
    requiredToNextLevel,
    createdAt
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

async function getLevel(
  walletId: string,
  env: Env
): Promise<
  | {
      points: number;
      level: number;
      requiredToNextLevel: number;
      creditToNextLevel: number;
    }
  | Response
> {
  const res = await fetch(
    `https://api.stats.gallery/${env.NETWORK_ID}/score-calculate?account_id=${walletId}`
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

async function getStakeBadge(
  walletId: string,
  env: Env
): Promise<boolean | Response> {
  const res = await fetch(
    `https://api.stats.gallery/${env.NETWORK_ID}/badge-stake?account_id=${walletId}`
  );
  if (!res.ok) {
    logErrorResponse('GET Near stake badge', res);
    return new Response('', { status: 400 });
  }
  const stakeRes: { result: number }[] = await res.json();
  const { result } = stakeRes.pop() ?? { result: 0 };
  return result === 1;
}

async function getCreatedAt(
  walletId: string,
  env: Env
): Promise<number | Response> {
  const res = await fetch(
    `https://api.stats.gallery/${env.NETWORK_ID}/account-creation?account_id=${walletId}`
  );
  if (!res.ok) {
    logErrorResponse('GET Near created at', res);
    return new Response('', { status: 400 });
  }
  const createdRes: { result: number }[] = await res.json();
  const { result } = createdRes.pop() ?? { result: 0 };
  return result / 1_000_000;
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
  private env: Env;
  private initializePromise: Promise<void> | undefined;
  private user?: NearUser | null;
  private router: Router<unknown>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.user = null;
    this.router = Router()
      .get('/nftdrop/*', async () => {
        if (!this.user || !isNearUserOk(this.user, this.env.DATE_THRESHOLD)) {
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
