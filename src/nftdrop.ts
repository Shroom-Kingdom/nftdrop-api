import { Router, Request } from 'itty-router';
import { Account } from 'near-api-js';
import { match } from 'ts-pattern';

import { DiscordUser } from './discord';
import { logErrorResponse } from './helpers';
import { initContract, NftContract, NftMetadata } from './near';
import { Session } from './session';
import { TwitterUser } from './twitter';

const router = Router({ base: '/nftdrop' });
export { router as nftdropRouter };

interface Owner {
  walletId: string;
  discordOwnerId: string;
  twitterOwnerId: string;
}

enum NftType {
  Smb1Small = 'smb1-small',
  Smb1Big = 'smb1-big',
  Smb3Small = 'smb3-small',
  Smb3Big = 'smb3-big',
  SmwSmall = 'smw-small',
  SmwBig = 'smw-big'
}

interface AvailableNfts {
  [NftType.Smb1Small]: NftMetadata[];
  [NftType.Smb1Big]: NftMetadata[];
  [NftType.Smb3Small]: NftMetadata[];
  [NftType.Smb3Big]: NftMetadata[];
  [NftType.SmwSmall]: NftMetadata[];
  [NftType.SmwBig]: NftMetadata[];
}

interface DistributedNft {
  token_id: string;
  nft: NftType;
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

    let near = false;
    if (walletId != null) {
      const nearAddr = env.NEAR.idFromName(walletId);
      const nearObj = env.NEAR.get(nearAddr);
      const nearRes = await nearObj.fetch(req.url);
      near = nearRes.ok;
    }

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
    const { tokenId, approvalId, imgSrc } = res.ok
      ? await res.json()
      : { tokenId: null, approvalId: null, imgSrc: null };

    return new Response(
      JSON.stringify({
        near,
        discord,
        twitter,
        tokenId,
        approvalId,
        imgSrc
      })
    );
  })
  .post('/claim', async (req, env: Env, session: Session) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { walletId, nft }: { walletId: string; nft: NftType } =
      await req.json();
    if (!session.discord || !session.twitter) {
      return new Response('', { status: 400 });
    }

    const discordUser = await env.DISCORD_SESSIONS.get(
      session.discord.accessToken
    );
    if (!discordUser) {
      return new Response('', { status: 400 });
    }
    const discord: DiscordUser = JSON.parse(discordUser);

    const twitterUser = await env.TWITTER_SESSIONS.get(
      session.twitter.oauthTokenSecret
    );
    if (!twitterUser) {
      return new Response('', { status: 400 });
    }
    const twitter: TwitterUser = JSON.parse(twitterUser);

    const nearAddr = env.NEAR.idFromName(walletId);
    const nearObj = env.NEAR.get(nearAddr);
    const nearRes = await nearObj.fetch(req.url);
    if (!nearRes.ok) {
      await logErrorResponse('POST Nftdrop check near', nearRes);
      return new Response('', { status: 403 });
    }

    const discordAddr = env.DISCORD.idFromName(discord.id);
    const discordObj = env.DISCORD.get(discordAddr);
    const discordRes = await discordObj.fetch(req.url);
    if (!discordRes.ok) {
      await logErrorResponse('POST Nftdrop check discord', discordRes);
      return new Response('', { status: 403 });
    }

    const twitterAddr = env.TWITTER.idFromName(twitter.screenName);
    const twitterObj = env.TWITTER.get(twitterAddr);
    const twitterRes = await twitterObj.fetch(req.url);
    if (!twitterRes.ok) {
      await logErrorResponse('POST Nftdrop check twitter', twitterRes);
      return new Response('', { status: 403 });
    }

    const addr = env.NFTDROP.idFromName('1');
    const obj = env.NFTDROP.get(addr);
    const res = await obj.fetch(req.url, {
      method: 'POST',
      body: JSON.stringify({
        walletId,
        discordOwnerId: discord.id,
        twitterOwnerId: twitter.screenName,
        nft
      }),
      headers: {
        'Wallet-Key': env.NEAR_KEY_PAIR
      }
    });
    if (!res.ok) {
      await logErrorResponse('POST Nftdrop add', res);
    }
    return res;
  })
  .post('/reset', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { password }: { password: string } = await req.json();
    if (password !== env.RESET_PASSWORD || env.RESET_PASSWORD == null) {
      return new Response('', { status: 401 });
    }

    const addr = env.NFTDROP.idFromName('1');
    const obj = env.NFTDROP.get(addr);
    const res = await obj.fetch(req.url, {
      method: 'POST'
    });
    return res;
  });

export class Nftdrop {
  private state: DurableObjectState;
  private env: Env;
  private initializePromise?: Promise<void>;
  private account?: Account;
  private contract?: NftContract;
  private baseUri?: string;
  private availableNfts?: AvailableNfts;
  private router: Router<unknown>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.router = Router({ base: '/nftdrop' })
      .get('/info', () => {
        if (!this.availableNfts) {
          return new Response('', { status: 400 });
        }
        return new Response(
          JSON.stringify({
            [NftType.Smb1Small]: this.availableNfts[NftType.Smb1Small].length,
            [NftType.Smb1Big]: this.availableNfts[NftType.Smb1Big].length,
            [NftType.Smb3Small]: this.availableNfts[NftType.Smb3Small].length,
            [NftType.Smb3Big]: this.availableNfts[NftType.Smb3Big].length,
            [NftType.SmwSmall]: this.availableNfts[NftType.SmwSmall].length,
            [NftType.SmwBig]: this.availableNfts[NftType.SmwBig].length
          })
        );
      })
      .post('/check', async req => {
        if (!req.json || !this.contract) {
          return new Response('', { status: 400 });
        }
        const { walletId, discordOwnerId, twitterOwnerId }: Owner =
          await req.json();
        const [walletToDrop, discordToDrop, twitterToDrop] = await Promise.all([
          this.state.storage.get<DistributedNft>(`walletToDrop${walletId}`),
          this.state.storage.get<DistributedNft>(
            `discordToDrop${discordOwnerId}`
          ),
          this.state.storage.get<DistributedNft>(
            `twitterToDrop${twitterOwnerId}`
          )
        ]);
        if (
          walletToDrop &&
          discordToDrop &&
          twitterToDrop &&
          walletToDrop.token_id === discordToDrop.token_id &&
          discordToDrop.token_id === twitterToDrop.token_id
        ) {
          const token = await this.contract.nft_token({
            token_id: walletToDrop.token_id
          });
          const approvalId = token.approved_account_ids[walletId];

          const imgSrc = `${this.baseUri ? `${this.baseUri}/` : ''}${
            token.metadata.media
          }`;

          return new Response(
            JSON.stringify({
              tokenId: walletToDrop.token_id,
              approvalId,
              imgSrc
            })
          );
        }
        return new Response('', { status: 400 });
      })
      .post('/claim', async req => {
        if (
          !req.json ||
          !this.availableNfts ||
          !this.contract ||
          !this.baseUri
        ) {
          return new Response('', { status: 400 });
        }
        const {
          walletId,
          discordOwnerId,
          twitterOwnerId,
          nft
        }: Owner & { nft: NftType } = await req.json();

        const [walletToDrop, discordToDrop, twitterToDrop] = await Promise.all([
          this.state.storage.get<DistributedNft>(`walletToDrop${walletId}`),
          this.state.storage.get<DistributedNft>(
            `discordToDrop${discordOwnerId}`
          ),
          this.state.storage.get<DistributedNft>(
            `twitterToDrop${twitterOwnerId}`
          )
        ]);
        if (
          walletToDrop != null ||
          discordToDrop != null ||
          twitterToDrop != null
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
          await this.contract.nft_approve({
            args: {
              account_id: walletId,
              token_id: availableNft.token_id
            },
            amount: '240000000000000000000'
          });
        } catch (err) {
          this.availableNfts[nft].push(availableNft);
          return new Response('', { status: 500 });
        }

        await this.state.storage.put(`walletToDrop${walletId}`, distributedNft);
        await this.state.storage.put(
          `discordToDrop${discordOwnerId}`,
          distributedNft
        );
        await this.state.storage.put(
          `twitterToDrop${twitterOwnerId}`,
          distributedNft
        );

        const token = await this.contract.nft_token({
          token_id: availableNft.token_id
        });
        const approvalId = token.approved_account_ids[walletId];

        const imgSrc = `${this.baseUri ? `${this.baseUri}/` : ''}${
          token.metadata.media
        }`;

        return new Response(
          JSON.stringify({ tokenId: availableNft.token_id, approvalId, imgSrc })
        );
      })
      .post('/reset', async () => {
        await this.state.storage.deleteAll();
        return new Response('', { status: 204 });
      });
  }

  async initialize(req: Request): Promise<void> {
    // FIXME
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walletKey = await (req as any).headers.get('Wallet-Key');
    if (walletKey) {
      await this.initializeAccount(walletKey);
    }
  }

  async initializeAccount(walletKey: string): Promise<void> {
    if (!this.account || !this.contract || !this.availableNfts) {
      this.contract = await initContract(walletKey, this.env);

      const { base_uri } = await this.contract.nft_metadata();
      this.baseUri = base_uri;

      const nfts = await this.contract.nft_tokens_for_owner({
        account_id: this.env.CONTRACT_ID
      });
      this.availableNfts = {
        [NftType.Smb1Small]: [],
        [NftType.Smb1Big]: [],
        [NftType.Smb3Small]: [],
        [NftType.Smb3Big]: [],
        [NftType.SmwSmall]: [],
        [NftType.SmwBig]: []
      };
      for (const nft of nfts) {
        for (const accountId of Object.keys(nft.approved_account_ids)) {
          await this.revokeNftApproval(this.contract, nft, accountId);
        }

        const [token_id] = nft.token_id.split(':') as [NftType];
        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        match(token_id)
          .with(NftType.Smb1Small, () => {
            this.availableNfts![NftType.Smb1Small].push({
              token_id: nft.token_id,
              approved_account_ids: {},
              metadata: nft.metadata
            });
          })
          .with(NftType.Smb1Big, () => {
            this.availableNfts![NftType.Smb1Big].push({
              token_id: nft.token_id,
              approved_account_ids: {},
              metadata: nft.metadata
            });
          })
          .with(NftType.Smb3Small, () => {
            this.availableNfts![NftType.Smb3Small].push({
              token_id: nft.token_id,
              approved_account_ids: {},
              metadata: nft.metadata
            });
          })
          .with(NftType.Smb3Big, () => {
            this.availableNfts![NftType.Smb3Big].push({
              token_id: nft.token_id,
              approved_account_ids: {},
              metadata: nft.metadata
            });
          })
          .with(NftType.SmwSmall, () => {
            this.availableNfts![NftType.SmwSmall].push({
              token_id: nft.token_id,
              approved_account_ids: {},
              metadata: nft.metadata
            });
          })
          .with(NftType.SmwBig, () => {
            this.availableNfts![NftType.SmwBig].push({
              token_id: nft.token_id,
              approved_account_ids: {},
              metadata: nft.metadata
            });
          })
          .exhaustive();
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.initializePromise) {
      this.initializePromise = this.initialize(request).catch(err => {
        this.initializePromise = undefined;
        throw err;
      });
    }
    await this.initializePromise;

    return this.router.handle(request);
  }

  async revokeNftApproval(
    contract: NftContract,
    nft: NftMetadata,
    accountId: string
  ): Promise<void> {
    await contract.nft_revoke({
      args: {
        token_id: nft.token_id,
        account_id: accountId
      },
      amount: '1'
    });
    const walletToDrop = await this.state.storage.get<DistributedNft>(
      `walletToDrop${accountId}`
    );
    if (walletToDrop) {
      await this.state.storage.delete(`walletToDrop${accountId}`);

      const { discordOwnerId } = walletToDrop.owner;
      const discordToDrop = await this.state.storage.get<DistributedNft>(
        `discordToDrop${discordOwnerId}`
      );
      if (discordToDrop) {
        await this.state.storage.delete(`discordToDrop${discordOwnerId}`);
      }

      const { twitterOwnerId } = walletToDrop.owner;
      const twitterToDrop = await this.state.storage.get<DistributedNft>(
        `twitterToDrop${twitterOwnerId}`
      );
      if (twitterToDrop) {
        await this.state.storage.delete(`twitterToDrop${twitterOwnerId}`);
      }
    }
  }
}
