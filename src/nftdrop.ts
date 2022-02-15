import { Router, Request } from 'itty-router';

import { logErrorResponse } from './helpers';

const router = Router({ base: '/nftdrop' });
export { router as nftdropRouter };

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
    const addr = env.NFTDROP.idFromName('1');
    const obj = env.NFTDROP.get(addr);
    const res = await obj.fetch(req.url);
    if (!res.ok) {
      await logErrorResponse('GET Nftdrop info', res);
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

    const addr = env.NFTDROP.idFromName('1');
    const obj = env.NFTDROP.get(addr);
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
        discordOwnerId,
        twitterOwnerId
      })
    });
    if (!res.ok) {
      await logErrorResponse('POST Nftdrop add', res);
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
    const addr = env.NFTDROP.idFromName('1');
    const obj = env.NFTDROP.get(addr);
    const res = await obj.fetch(req.url, {
      method: 'POST',
      body: JSON.stringify(drops)
    });
    if (!res.ok) {
      await logErrorResponse('POST Nftdrop add', res);
    }
    return res;
  });

export class Nftdrop {
  private state: DurableObjectState;
  private initializePromise: Promise<void> | undefined;
  private drops: Drop[] = [];
  private discordToDrop: Record<string, Drop> = {};
  private twitterToDrop: Record<string, Drop> = {};
  private router: Router<unknown>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.router = Router({ base: '/nftdrop' })
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
          this.discordToDrop[discordOwnerId].link ===
            this.twitterToDrop[twitterOwnerId].link
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
        if (
          this.discordToDrop[discordOwnerId] != null ||
          this.twitterToDrop[twitterOwnerId] != null
        ) {
          return new Response('', { status: 400 });
        }
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
        await this.saveDrops();
        await this.state.storage.put(`discordToDrop${discordOwnerId}`, drop);
        await this.state.storage.put(`twitterToDrop${twitterOwnerId}`, drop);
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
        await this.saveDrops();
        return new Response('', { status: 204 });
      });
  }

  async initialize(): Promise<void> {
    this.drops = (await this.state.storage.get('drops')) ?? [];
    await this.state.storage.delete('drops');
    for (let i = 0; i < 1000; i++) {
      const drops: Drop[] | undefined = await this.state.storage.get(
        `drops${i}`
      );
      if (!drops) break;
      this.drops = this.drops.concat(drops);
    }
    this.discordToDrop = (await this.state.storage.get('discordToDrop')) ?? {};
    await this.state.storage.delete('discordToDrop');
    this.twitterToDrop = (await this.state.storage.get('twitterToDrop')) ?? {};
    await this.state.storage.delete('twitterToDrop');
    for (const drop of this.drops) {
      if (!drop.owner) continue;
      const discordToDrop: Drop | undefined = await this.state.storage.get(
        `discordToDrop${drop.owner.discordOwnerId}`
      );
      if (!discordToDrop) continue;
      this.discordToDrop[drop.owner.discordOwnerId] = discordToDrop;
      const twitterToDrop: Drop | undefined = await this.state.storage.get(
        `twitterToDrop${drop.owner.twitterOwnerId}`
      );
      if (!twitterToDrop) continue;
      this.twitterToDrop[drop.owner.twitterOwnerId] = twitterToDrop;
    }
    await this.saveState();
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

  async saveState(): Promise<void[][]> {
    return Promise.all([
      this.saveDrops(),
      this.saveAllDiscordToDrop(),
      this.saveAllTwitterToDrop()
    ]);
  }

  async saveDrops(): Promise<void[]> {
    const promises = [];
    for (
      let i = 0, offset = 0;
      offset < this.drops.length;
      i++, offset += 100
    ) {
      const drops = this.drops.slice(offset, offset + 100);
      promises.push(this.state.storage.put(`drops${i}`, drops));
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
