import { Router, Request } from 'itty-router';

import { DATE_THRESHOLD } from './config';
import { logErrorResponse } from './helpers';

const router = Router({ base: '/discord' });
export { router as discordRouter };

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  createdAt: string;
  refreshToken: string;
  isMember: boolean;
  isHumanguildMember: boolean;
  verified: boolean;
  acceptedRules: boolean;
  solvedCaptcha: boolean;
  discordsComVote: boolean;
  topGgVote: boolean;
}

export function isDiscordUserOk(user: DiscordUser): boolean {
  return (
    user.isMember &&
    user.isHumanguildMember &&
    user.verified &&
    user.acceptedRules &&
    user.solvedCaptcha &&
    user.discordsComVote &&
    user.topGgVote &&
    new Date(user.createdAt).valueOf() < DATE_THRESHOLD.valueOf()
  );
}

router
  .get('/:id', async (req, env: Env) => {
    const id = req.params?.id;
    if (id == null) {
      return new Response('', { status: 400 });
    }
    const addr = env.DISCORD.idFromName(id);
    const obj = env.DISCORD.get(addr);
    const res = await obj.fetch(req.url);
    if (!res.ok) {
      console.error(await res.text());
      console.error(res.statusText);
      return new Response('', { status: 400 });
    }
    return new Response(await res.text());
  })
  .post('/token', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { code } = await req.json();
    if (code == null) {
      return new Response('', { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let origin = (req as any).headers.get('Origin') as string;
    if (!origin.endsWith('/')) origin += '/';
    const body = new URLSearchParams();
    body.append('client_id', env.DISCORD_CLIENT_ID);
    body.append('client_secret', env.DISCORD_CLIENT_SECRET);
    body.append('grant_type', 'authorization_code');
    body.append('code', code);
    body.append('redirect_uri', origin);
    body.append('scope', 'identify guilds email');

    return saveDiscordUser(req, body, env);
  })
  .post('/refresh', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { refresh_token } = await req.json();
    if (refresh_token == null) {
      return new Response('', { status: 400 });
    }
    const body = new URLSearchParams();
    body.append('client_id', env.DISCORD_CLIENT_ID);
    body.append('client_secret', env.DISCORD_CLIENT_SECRET);
    body.append('grant_type', 'refresh_token');
    body.append('refresh_token', refresh_token);

    return saveDiscordUser(req, body, env);
  });

async function saveDiscordUser(req: Request, body: URLSearchParams, env: Env) {
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  if (!res.ok) {
    await logErrorResponse('POST Discord token', res);
    return new Response('', { status: 400 });
  }
  const { access_token: accessToken, refresh_token: refreshToken } =
    await res.json();
  const user = await fetchUserInfo(accessToken, refreshToken, env);
  if (user == null) {
    return new Response('', { status: 400 });
  }

  const addr = env.DISCORD.idFromName(user.id);
  const obj = env.DISCORD.get(addr);
  const objRes = await obj.fetch(req.url, {
    method: 'PUT',
    body: JSON.stringify(user)
  });
  if (!objRes.ok) {
    console.error('Discord DO', await objRes.text());
    return new Response('', { status: 400 });
  }

  return new Response(JSON.stringify(user));
}

async function fetchUserInfo(
  accessToken: string,
  refreshToken: string,
  env: Env
): Promise<DiscordUser | undefined> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!res.ok) {
    console.error('fetch discord user', await res.text());
    return;
  }
  const { id, username, discriminator, verified } = await res.json();
  const createdAt = convertIDtoDate(id);

  const guildRes = await fetch(`https://discord.com/api/users/@me/guilds`, {
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
    }
  });
  const shrmGuildRes = await fetch(
    `https://discord.com/api/guilds/168893527357521920/members/${id}`,
    {
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
      }
    }
  );
  if (!guildRes.ok || !shrmGuildRes.ok) {
    console.error('fetch guild member', await guildRes.text());
    return {
      id,
      username,
      discriminator,
      createdAt: createdAt.toISOString(),
      refreshToken,
      isMember: false,
      isHumanguildMember: false,
      verified,
      acceptedRules: false,
      solvedCaptcha: false,
      discordsComVote: false,
      topGgVote: false
    };
  }
  const { roles }: { roles: string[] } = await shrmGuildRes.json();
  const guilds: { id: string }[] = await guildRes.json();
  const guildIds = guilds.map(guild => guild.id);
  const isMember = guildIds.includes('168893527357521920');
  const isHumanguildMember = guildIds.includes('808933630683775008');
  const newMemberRole = '880382185213923339';
  const memberRole = '891312134733045850';
  const discordsComVoteRole = '888329979958558781';
  const topGgVoteRole = '888885237222899753';
  const acceptedRules = !roles.includes(newMemberRole);
  const solvedCaptcha = roles.includes(memberRole);
  const discordsComVote = roles.includes(discordsComVoteRole);
  const topGgVote = roles.includes(topGgVoteRole);
  return {
    id,
    username,
    discriminator,
    createdAt: createdAt.toISOString(),
    refreshToken,
    isMember,
    isHumanguildMember,
    verified,
    acceptedRules,
    solvedCaptcha,
    discordsComVote,
    topGgVote
  };
}

function convertIDtoDate(id: string): Date {
  const bin = (+id).toString(2);
  const m = 64 - bin.length;
  const unixbin = bin.substring(0, 42 - m);
  return new Date(parseInt(unixbin, 2) + 1420070400000);
}

export class Discord {
  private state: DurableObjectState;
  private initializePromise: Promise<void> | undefined;
  private user: DiscordUser | null;
  private router: Router<unknown>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.user = null;
    this.router = Router()
      .get('/linkdrop/*', async () => {
        if (!this.user || !isDiscordUserOk(this.user)) {
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
        const user: DiscordUser = await req.json();
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
