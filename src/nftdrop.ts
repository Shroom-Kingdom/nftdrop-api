import { Router, Request } from 'itty-router';
import { Account, Contract } from 'near-api-js';
import { match } from 'ts-pattern';

import { logErrorResponse } from './helpers';
import { nearLogin } from './near';

const router = Router({ base: '/nftdrop' });
export { router as nftdropRouter };

interface Owner {
  walletId: string;
  discordOwnerId: string;
  twitterOwnerId: string;
}

enum Nft {
  Smb1Small = 'smb1-small',
  Smb1Big = 'smb1-big',
  Smb3Small = 'smb3-small',
  Smb3Big = 'smb3-big',
  SmwSmall = 'smw-small',
  SmwBig = 'smw-big'
}

interface NftContract extends Contract {
  nft_tokens_for_owner: (params: {
    account_id: string;
  }) => Promise<NftMetadata[]>;
  nft_transfer: (params: {
    receiver_id: string;
    token_id: string;
    approval_id: number;
  }) => Promise<unknown>;
}

interface NftMetadata {
  token_id: string;
}

interface AvailableNfts {
  [Nft.Smb1Small]: NftMetadata[];
  [Nft.Smb1Big]: NftMetadata[];
  [Nft.Smb3Small]: NftMetadata[];
  [Nft.Smb3Big]: NftMetadata[];
  [Nft.SmwSmall]: NftMetadata[];
  [Nft.SmwBig]: NftMetadata[];
}

interface DistributedNft {
  token_id: string;
  nft: Nft;
  owner: Owner;
}

router
  .get('/info', async (req, env: Env) => {
    const addr = env.NFTDROP.idFromName('1');
    const obj = env.NFTDROP.get(addr);
    const res = await obj.fetch(req.url, {
      headers: {
        'Wallet-Key': env.NEAR_KEY_PAIR
      }
    });
    if (!res.ok) {
      await logErrorResponse('GET Nftdrop info', res);
    }
    return res;
  })
  .post('/check', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { walletId, discordOwnerId, twitterOwnerId }: Owner =
      await req.json();

    let discord = false;
    if (discordOwnerId != null) {
      const discordAddr = env.DISCORD.idFromName(discordOwnerId);
      const discordObj = env.DISCORD.get(discordAddr);
      const discordRes = await discordObj.fetch(req.url);
      discord = discordRes.ok;
    }

    let twitter = false;
    if (twitterOwnerId != null) {
      const twitterAddr = env.TWITTER.idFromName(twitterOwnerId);
      const twitterObj = env.TWITTER.get(twitterAddr);
      const twitterRes = await twitterObj.fetch(req.url);
      twitter = twitterRes.ok;
    }

    const addr = env.NFTDROP.idFromName('1');
    const obj = env.NFTDROP.get(addr);
    const res = await obj.fetch(req.url, {
      method: 'POST',
      body: JSON.stringify({
        walletId,
        discordOwnerId,
        twitterOwnerId
      }),
      headers: {
        'Wallet-Key': env.NEAR_KEY_PAIR
      }
    });
    const tokenId = res.ok ? await res.text() : null;

    return new Response(
      JSON.stringify({
        discord,
        twitter,
        tokenId
      })
    );
  })
  .post('/claim', async (req, env: Env) => {
    // TODO session
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { walletId, discordOwnerId, twitterOwnerId }: Owner =
      await req.json();
    if (discordOwnerId == null || twitterOwnerId == null) {
      return new Response('', { status: 400 });
    }

    const discordAddr = env.DISCORD.idFromName(discordOwnerId);
    const discordObj = env.DISCORD.get(discordAddr);
    const discordRes = await discordObj.fetch(req.url);
    if (!discordRes.ok) {
      await logErrorResponse('POST Nftdrop check discord', discordRes);
    }

    const twitterAddr = env.TWITTER.idFromName(twitterOwnerId);
    const twitterObj = env.TWITTER.get(twitterAddr);
    const twitterRes = await twitterObj.fetch(req.url);
    if (!twitterRes.ok) {
      await logErrorResponse('POST Nftdrop check twitter', twitterRes);
    }

    const addr = env.NFTDROP.idFromName('1');
    const obj = env.NFTDROP.get(addr);
    const res = await obj.fetch(req.url, {
      method: 'POST',
      body: JSON.stringify({
        walletId,
        discordOwnerId,
        twitterOwnerId
      }),
      headers: {
        'Wallet-Key': env.NEAR_KEY_PAIR
      }
    });
    if (!res.ok) {
      await logErrorResponse('POST Nftdrop add', res);
    }
    return res;
  });

export class Nftdrop {
  private state: DurableObjectState;
  private initializePromise: Promise<void> | undefined;
  private account: Account | undefined;
  private contract: NftContract | undefined;
  private availableNfts: AvailableNfts | undefined;
  private distributedNfts: DistributedNft[] = [];
  private walletToDrop: Record<string, DistributedNft> = {};
  private discordToDrop: Record<string, DistributedNft> = {};
  private twitterToDrop: Record<string, DistributedNft> = {};
  private router: Router<unknown>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.router = Router({ base: '/nftdrop' })
      .get('/info', () => {
        if (!this.availableNfts) {
          return new Response('', { status: 400 });
        }
        return new Response(
          JSON.stringify({
            [Nft.Smb1Small]: this.availableNfts[Nft.Smb1Small].length,
            [Nft.Smb1Big]: this.availableNfts[Nft.Smb1Big].length,
            [Nft.Smb3Small]: this.availableNfts[Nft.Smb3Small].length,
            [Nft.Smb3Big]: this.availableNfts[Nft.Smb3Big].length,
            [Nft.SmwSmall]: this.availableNfts[Nft.SmwSmall].length,
            [Nft.SmwBig]: this.availableNfts[Nft.SmwBig].length
          })
        );
      })
      .post('/check', async req => {
        if (!req.json) {
          return new Response('', { status: 400 });
        }
        const { walletId, discordOwnerId, twitterOwnerId }: Owner =
          await req.json();
        if (
          this.walletToDrop[walletId] &&
          this.discordToDrop[discordOwnerId] &&
          this.twitterToDrop[twitterOwnerId] &&
          this.walletToDrop[walletId].token_id ===
            this.discordToDrop[twitterOwnerId].token_id &&
          this.discordToDrop[discordOwnerId].token_id ===
            this.twitterToDrop[twitterOwnerId].token_id
        ) {
          return new Response(this.walletToDrop[walletId].token_id);
        }
        return new Response('', { status: 400 });
      })
      .post('/claim', async req => {
        if (!req.json || !this.availableNfts || !this.contract) {
          return new Response('', { status: 400 });
        }
        const {
          walletId,
          discordOwnerId,
          twitterOwnerId,
          nft
        }: Owner & { nft: Nft } = await req.json();
        if (
          this.walletToDrop[walletId] != null ||
          this.discordToDrop[discordOwnerId] != null ||
          this.twitterToDrop[twitterOwnerId] != null
        ) {
          return new Response('', { status: 400 });
        }

        const availableNft = this.availableNfts[nft].pop();
        if (!availableNft) {
          return new Response('', { status: 403 });
        }
        const distributedNft: DistributedNft = {
          token_id: availableNft.token_id,
          nft,
          owner: {
            walletId,
            discordOwnerId,
            twitterOwnerId
          }
        };
        try {
          await this.contract.nft_transfer({
            receiver_id: walletId,
            token_id: availableNft.token_id,
            approval_id: 0
          });
        } catch (err) {
          this.availableNfts[nft].push(availableNft);
        }

        this.walletToDrop[walletId] = distributedNft;
        this.discordToDrop[discordOwnerId] = distributedNft;
        this.twitterToDrop[twitterOwnerId] = distributedNft;
        await this.saveDistributedNfts();
        await this.state.storage.put(`walletToDrop${walletId}`, distributedNft);
        await this.state.storage.put(
          `discordToDrop${discordOwnerId}`,
          distributedNft
        );
        await this.state.storage.put(
          `twitterToDrop${twitterOwnerId}`,
          distributedNft
        );
        return new Response(distributedNft.token_id);
      });
  }

  async initialize(): Promise<void> {
    this.distributedNfts = [];
    for (let i = 0; i < 1000; i++) {
      const distributedNfts: DistributedNft[] | undefined =
        await this.state.storage.get(`distributedNfts${i}`);
      if (!distributedNfts) break;
      this.distributedNfts = this.distributedNfts.concat(distributedNfts);
    }

    this.walletToDrop = {};
    this.discordToDrop = {};
    this.twitterToDrop = {};
    for (const drop of this.distributedNfts) {
      if (!drop.owner) continue;
      const walletToDrop: DistributedNft | undefined =
        await this.state.storage.get(`walletToDrop${drop.owner.walletId}`);
      if (walletToDrop) {
        this.walletToDrop[drop.owner.walletId] = walletToDrop;
      }
      const discordToDrop: DistributedNft | undefined =
        await this.state.storage.get(
          `discordToDrop${drop.owner.discordOwnerId}`
        );
      if (discordToDrop) {
        this.discordToDrop[drop.owner.discordOwnerId] = discordToDrop;
      }
      const twitterToDrop: DistributedNft | undefined =
        await this.state.storage.get(
          `twitterToDrop${drop.owner.twitterOwnerId}`
        );
      if (twitterToDrop) {
        this.twitterToDrop[drop.owner.twitterOwnerId] = twitterToDrop;
      }
    }
    await this.saveState();
  }

  async initializeAccount(walletKey: string): Promise<void> {
    if (!this.account || !this.contract || !this.availableNfts) {
      this.account = await nearLogin(walletKey);
      this.contract = new Contract(this.account, 'near-chan-v5.shrm.testnet', {
        changeMethods: [],
        viewMethods: ['nft_tokens_for_owner']
      }) as NftContract;
      const nfts = await this.contract.nft_tokens_for_owner({
        account_id: 'near-chan-v5.shrm.testnet'
      });
      this.availableNfts = {
        [Nft.Smb1Small]: [],
        [Nft.Smb1Big]: [],
        [Nft.Smb3Small]: [],
        [Nft.Smb3Big]: [],
        [Nft.SmwSmall]: [],
        [Nft.SmwBig]: []
      };
      for (const nft of nfts) {
        const [token_id] = nft.token_id.split(':') as [Nft];
        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        match(token_id)
          .with(Nft.Smb1Small, () => {
            this.availableNfts![Nft.Smb1Small].push({ token_id: nft.token_id });
          })
          .with(Nft.Smb1Big, () => {
            this.availableNfts![Nft.Smb1Big].push({ token_id: nft.token_id });
          })
          .with(Nft.Smb3Small, () => {
            this.availableNfts![Nft.Smb3Small].push({ token_id: nft.token_id });
          })
          .with(Nft.Smb3Big, () => {
            this.availableNfts![Nft.Smb3Big].push({ token_id: nft.token_id });
          })
          .with(Nft.SmwSmall, () => {
            this.availableNfts![Nft.SmwSmall].push({ token_id: nft.token_id });
          })
          .with(Nft.SmwBig, () => {
            this.availableNfts![Nft.SmwBig].push({ token_id: nft.token_id });
          })
          .exhaustive();
        /* eslint-enable @typescript-eslint/no-non-null-assertion */
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.initializePromise) {
      this.initializePromise = this.initialize().catch(err => {
        this.initializePromise = undefined;
        throw err;
      });
    }
    await this.initializePromise;

    if (request.json) {
      // FIXME
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walletKey = await (request as any).headers.get('Wallet-Key');
      if (walletKey) {
        await this.initializeAccount(walletKey);
      }
    }
    return this.router.handle(request);
  }

  async saveState(): Promise<void[][]> {
    return Promise.all([
      this.saveDistributedNfts(),
      this.saveAllWalletToDrop(),
      this.saveAllDiscordToDrop(),
      this.saveAllTwitterToDrop()
    ]);
  }

  async saveDistributedNfts(): Promise<void[]> {
    const promises = [];
    for (
      let i = 0, offset = 0;
      offset < this.distributedNfts.length;
      i++, offset += 100
    ) {
      const distributedNfts = this.distributedNfts.slice(offset, offset + 100);
      promises.push(
        this.state.storage.put(`distributedNfts${i}`, distributedNfts)
      );
    }
    return Promise.all(promises);
  }

  async saveAllWalletToDrop(): Promise<void[]> {
    const promises = [];
    const walletToDropEntries = Object.entries(this.walletToDrop);
    for (const [key, value] of walletToDropEntries) {
      promises.push(this.state.storage.put(`walletToDrop${key}`, value));
    }
    return Promise.all(promises);
  }

  async saveAllDiscordToDrop(): Promise<void[]> {
    const promises = [];
    const discordToDropEntries = Object.entries(this.discordToDrop);
    for (const [key, value] of discordToDropEntries) {
      promises.push(this.state.storage.put(`discordToDrop${key}`, value));
    }
    return Promise.all(promises);
  }

  async saveAllTwitterToDrop(): Promise<void[]> {
    const promises = [];
    const twitterToDropEntries = Object.entries(this.twitterToDrop);
    for (const [key, value] of twitterToDropEntries) {
      promises.push(this.state.storage.put(`twitterToDrop${key}`, value));
    }
    return Promise.all(promises);
  }
}
