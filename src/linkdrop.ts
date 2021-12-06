import { Router, Request } from 'itty-router';

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
      console.error(await res.text());
      console.error(res.statusText);
      return new Response('', { status: 400 });
    }
    return new Response(await res.text());
  })
  .post('/claim', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { discordOwnerId, twitterOwnerId }: Owner = await req.json();
    if (discordOwnerId == null || twitterOwnerId == null) {
      return new Response('', { status: 400 });
    }
    const addr = env.DISCORD.idFromName(discordOwnerId);
    const obj = env.DISCORD.get(addr);
    const res = await obj.fetch(req.url);
    if (!res.ok) {
      console.error(await res.text());
      console.error(res.statusText);
      return new Response('', { status: 400 });
    }
  })
  .post('/owner', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { discordOwnerId, twitterOwnerId }: Owner = await req.json();
    if (discordOwnerId == null || twitterOwnerId == null) {
      return new Response('', { status: 400 });
    }
    const addr = env.LINKDROP.idFromName('1');
    const obj = env.LINKDROP.get(addr);
    const res = await obj.fetch(req.url, {
      method: 'POST',
      body: JSON.stringify({ discordOwnerId, twitterOwnerId })
    });
    if (!res.ok) {
      console.error(await res.text());
      console.error(res.statusText);
      return new Response('', { status: 400 });
    }
    return new Response(await res.text());
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
      console.error(await res.text());
      console.error(res.statusText);
      return new Response('', { status: 400 });
    }
    return new Response(await res.text());
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
    this.router = Router()
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
      .post('/owner', async req => {
        if (!req.json) {
          return new Response('', { status: 400 });
        }
        const { discordOwnerId, twitterOwnerId }: Owner = await req.json();
        if (discordOwnerId == null || twitterOwnerId == null) {
          return new Response('', { status: 400 });
        }
        if (
          this.discordToDrop[discordOwnerId] ===
          this.twitterToDrop[twitterOwnerId]
        ) {
          return new Response(
            JSON.stringify(this.discordToDrop[discordOwnerId])
          );
        }
        return new Response('', { status: 404 });
      })
      .post('/add', async req => {
        if (!req.json) {
          return new Response('', { status: 400 });
        }
        const drops: { link: string }[] = await req.json();
        this.drops.concat(drops.map(({ link }) => ({ link, owner: null })));
        this.state.storage.put('drops', this.drops);
        return new Response('', { status: 204 });
      });
  }

  async initialize(): Promise<void> {
    this.drops = await this.state.storage.get('drops');
    this.discordToDrop = await this.state.storage.get('discordToDrop');
    this.twitterToDrop = await this.state.storage.get('twitterToDrop');
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
