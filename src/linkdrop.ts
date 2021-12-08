import { Router, Request } from 'itty-router';

import { logErrorResponse } from './helpers';

const router = Router({ base: '/linkdrop' });
export { router as linkdropRouter };

interface Drop {
  link: string;
  owner: Owner | null;
}

interface Owner {
  discordOwnerId: string;
  twitterOwnerId: string;
}

router
  .get('/info', async (req, env: Env) => {
    const addr = env.LINKDROP.idFromName('1');
    const obj = env.LINKDROP.get(addr);
    const res = await obj.fetch(req.url);
    if (!res.ok) {
      await logErrorResponse('GET Linkdrop info', res);
    }
    return res;
  })
  .post('/check', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { discordOwnerId, twitterOwnerId }: Owner = await req.json();

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

    const addr = env.LINKDROP.idFromName('1');
    const obj = env.LINKDROP.get(addr);
    const res = await obj.fetch(req.url, {
      method: 'POST',
      body: JSON.stringify({
        discordOwnerId,
        twitterOwnerId
      })
    });
    const link = res.ok ? await res.text() : null;

    return new Response(
      JSON.stringify({
        discord,
        twitter,
        link
      })
    );
  })
  .post('/claim', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { discordOwnerId, twitterOwnerId }: Owner = await req.json();
    if (discordOwnerId == null || twitterOwnerId == null) {
      return new Response('', { status: 400 });
    }

    const discordAddr = env.DISCORD.idFromName(discordOwnerId);
    const discordObj = env.DISCORD.get(discordAddr);
    const discordRes = await discordObj.fetch(req.url);
    if (!discordRes.ok) {
      await logErrorResponse('POST Linkdrop check discord', discordRes);
    }

    const twitterAddr = env.TWITTER.idFromName(twitterOwnerId);
    const twitterObj = env.TWITTER.get(twitterAddr);
    const twitterRes = await twitterObj.fetch(req.url);
    if (!twitterRes.ok) {
      await logErrorResponse('POST Linkdrop check twitter', twitterRes);
    }

    const addr = env.LINKDROP.idFromName('1');
    const obj = env.LINKDROP.get(addr);
    const res = await obj.fetch(req.url, {
      method: 'POST',
      body: JSON.stringify({
        discordOwnerId,
        twitterOwnerId
      })
    });
    if (!res.ok) {
      await logErrorResponse('POST Linkdrop add', res);
    }
    return res;
  })
  .post('/add', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const drops: { link?: string }[] = await req.json();
    if (drops.some(({ link }) => link == null)) {
      return new Response('', { status: 400 });
    }
    const addr = env.LINKDROP.idFromName('1');
    const obj = env.LINKDROP.get(addr);
    const res = await obj.fetch(req.url, {
      method: 'POST',
      body: JSON.stringify(drops)
    });
    if (!res.ok) {
      await logErrorResponse('POST Linkdrop add', res);
    }
    return res;
  });

export class Linkdrop {
  private state: DurableObjectState;
  private initializePromise: Promise<void> | undefined;
  private drops: Drop[] = [];
  private discordToDrop: Record<string, Drop> = {};
  private twitterToDrop: Record<string, Drop> = {};
  private router: Router<unknown>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.router = Router({ base: '/linkdrop' })
      .get('/info', async () => {
        let claimed = 0;
        let unclaimed = 0;
        for (const drop of this.drops) {
          if (drop.owner != null) {
            claimed++;
          } else {
            unclaimed++;
          }
        }
        return new Response(
          JSON.stringify({
            claimed,
            unclaimed
          })
        );
      })
      .post('/check', async req => {
        if (!req.json) {
          return new Response('', { status: 400 });
        }
        const { discordOwnerId, twitterOwnerId }: Owner = await req.json();
        if (
          this.discordToDrop[discordOwnerId] &&
          this.twitterToDrop[twitterOwnerId] &&
          this.discordToDrop[discordOwnerId] ===
            this.twitterToDrop[twitterOwnerId]
        ) {
          return new Response(this.discordToDrop[discordOwnerId].link);
        }
        return new Response('', { status: 400 });
      })
      .post('/claim', async req => {
        if (!req.json) {
          return new Response('', { status: 400 });
        }
        const { discordOwnerId, twitterOwnerId }: Owner = await req.json();
        const drop = this.drops.find(({ owner }) => owner == null);
        if (!drop) {
          return new Response('', { status: 403 });
        }
        drop.owner = {
          discordOwnerId,
          twitterOwnerId
        };
        this.discordToDrop[discordOwnerId] = drop;
        this.twitterToDrop[twitterOwnerId] = drop;
        this.state.storage.put('drops', this.drops);
        this.state.storage.put('discordToDrop', this.discordToDrop);
        this.state.storage.put('twitterToDrop', this.twitterToDrop);
        return new Response(drop.link);
      })
      .post('/add', async req => {
        if (!req.json) {
          return new Response('', { status: 400 });
        }
        const drops: { link: string }[] = await req.json();
        this.drops = this.drops.concat(
          drops.map(({ link }) => ({ link, owner: null }))
        );
        this.state.storage.put('drops', this.drops);
        return new Response('', { status: 204 });
      });
  }

  async initialize(): Promise<void> {
    this.drops = (await this.state.storage.get('drops')) ?? [];
    this.discordToDrop = (await this.state.storage.get('discordToDrop')) ?? {};
    this.twitterToDrop = (await this.state.storage.get('twitterToDrop')) ?? {};
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
