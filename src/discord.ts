import { Router } from 'itty-router';

const router = Router({ base: '/discord' });
export { router as discordRouter };

interface DiscordUser {
  id: string;
  createdAt: string;
}

router
  .post('/token', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { code } = await req.json();
    if (code == null) {
      return new Response('', { status: 400 });
    }
    const body = new URLSearchParams();
    body.append('client_id', env.DISCORD_CLIENT_ID);
    body.append('client_secret', env.DISCORD_CLIENT_SECRET);
    body.append('grant_type', 'authorization_code');
    body.append('code', code);
    body.append('redirect_uri', 'http://localhost:3000/');
    body.append('scope', 'identify guilds');
    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body
    });
    if (!res.ok) {
      console.error(await res.text());
      console.error(res.statusText);
      return new Response('', { status: 400 });
    }
    const { access_token: accessToken } = await res.json();
    await fetchUserInfo(accessToken);

    const headers = new Headers(res.headers);
    headers.set(
      'Access-Control-Allow-Origin',
      (req as any).headers.get('Origin')
    );
    return new Response(text, { headers });
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
    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body
    });
    if (!res.ok) {
      console.error(await res.text());
      console.error(res.statusText);
      return new Response('', { status: 400 });
    }
    const { access_token: accessToken } = await res.json();
    const user = await fetchUserInfo(accessToken);
    if (user == null) {
      return new Response('', { status: 400 });
    }

    const headers = new Headers(res.headers);
    headers.set(
      'Access-Control-Allow-Origin',
      (req as any).headers.get('Origin')
    );
    return new Response(JSON.stringify(user), { headers });
  });

async function fetchUserInfo(
  accessToken: string
): Promise<DiscordUser | undefined> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!res.ok) {
    console.error(await res.text());
    return;
  }
  const { id } = await res.json();
  const createdAt = convertIDtoDate(id);

  const guildRes = await fetch(
    `https://discord.com/api/guilds/168893527357521920/members/${id}`
  );
  if (!guildRes.ok) {
    console.error(await res.text());
    return;
  }
  const { pending } = await res.json();
  if (pending) {
    return;
  }
  return {
    id,
    createdAt: createdAt.toISOString()
  };
}

function convertIDtoDate(id: string): Date {
  const bin = (+id).toString(2);
  const m = 64 - bin.length;
  const unixbin = bin.substring(0, 42 - m);
  return new Date(parseInt(unixbin, 2) + 1420070400000);
}
