import { Router, Request } from 'itty-router';

import {
  REQUIRED_RT_HASHTAGS,
  TWITTER_ACCOUNT_ID,
  TWITTER_ACCOUNT_ID_ASAC,
  TWITTER_ACCOUNT_ID_FSC,
  TWITTER_ACCOUNT_ID_HUMANGUILD,
  TWITTER_ACCOUNT_ID_NEAR_GAMES,
  TWITTER_ACCOUNT_ID_NEAR_PROTOCOL,
  TWITTER_ACCOUNT_ID_NNC
} from './config';
import { logErrorResponse } from './helpers';
import { obtainOauthRequestToken, obtainOauthAccessToken } from './oauth';
import { Session, SessionHeader, TwitterSession } from './session';
import { createSignature } from './signature';

const router = Router({ base: '/twitter' });
export { router as twitterRouter };

export interface TwitterUser {
  name: string;
  screenName: string;
  verified: boolean;
  isFollowing: boolean;
  isFollowingHumanguild: boolean;
  isFollowingNEARGames: boolean;
  isFollowingNEARProtocol: boolean;
  isFollowingNNC: boolean;
  isFollowingFSC: boolean;
  isFollowingASAC: boolean;
  retweeted: boolean;
  liked: boolean;
}

interface Retweet {
  entities: {
    hashtags: { text: string }[];
  };
  quoted_status?: {
    id_str: string;
  };
}

interface LikedTweet {
  id_str: string;
}

export function isTwitterUserOk(user: TwitterUser): boolean {
  return user.verified && user.isFollowing && user.retweeted && user.liked;
}

router
  .get('/user/:id', async (req, env: Env) => {
    const id = req.params?.id;
    if (id == null) {
      return new Response('', { status: 400 });
    }
    const addr = env.TWITTER.idFromName(id);
    const obj = env.TWITTER.get(addr);
    const res = await obj.fetch(req.url);
    if (!res.ok) {
      logErrorResponse('Twitter GET user error', res);
      return new Response('', { status: res.status });
    }
    return new Response(await res.text());
  })
  .get('/request-token', async (req, env: Env) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let origin = (req as any).headers.get('Origin') as string;
    if (!origin.endsWith('/')) origin += '/';
    const obtainRequestTokenConfig = {
      apiUrl: 'https://api.twitter.com/oauth/request_token',
      callbackUrl: origin,
      consumerKey: env.CONSUMER_KEY,
      consumerSecret: env.CONSUMER_SECRET,
      method: 'POST'
    };
    const requestTokenData = await obtainOauthRequestToken(
      obtainRequestTokenConfig
    );
    return new Response(
      `https://api.twitter.com/oauth/authorize?oauth_token=${requestTokenData.oauth_token}`
    );
  })
  .post('/access-token', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    // eslint-disable-next-line prefer-const
    let { oauthToken, oauthVerifier } = await req.json();
    const { oauth_token, oauth_token_secret: oauthTokenSecret } =
      await obtainOauthAccessToken({
        apiUrl: 'https://api.twitter.com/oauth/access_token',
        consumerKey: env.CONSUMER_KEY,
        consumerSecret: env.CONSUMER_SECRET,
        oauthToken,
        oauthVerifier,
        method: 'POST'
      });
    oauthToken = oauth_token;

    const twitterSession: TwitterSession = {
      oauthToken,
      oauthTokenSecret
    };
    const user = await verifyUser(req, twitterSession, env);
    if (user instanceof Response) {
      return user;
    }

    await env.TWITTER_SESSIONS.put(oauthTokenSecret, JSON.stringify(user));
    return new Response(JSON.stringify(user), {
      headers: {
        [SessionHeader.Twitter]: encodeURIComponent(
          JSON.stringify(twitterSession)
        ),
        'Access-Control-Expose-Headers': SessionHeader.Twitter
      }
    });
  })
  .post('/verify', async (req, env: Env, session: Session) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    if (!session.twitter) {
      console.error(`POST Twitter verify session not set`);
      return new Response('', { status: 400 });
    }

    const user = await verifyUser(req, session.twitter, env);
    if (user instanceof Response) {
      return user;
    }

    return new Response(JSON.stringify(user));
  });

async function verifyUser(
  req: Request,
  twitterSession: TwitterSession,
  env: Env
): Promise<Response | TwitterUser> {
  let apiUrl = 'https://api.twitter.com/1.1/account/verify_credentials.json';
  let qs: Record<string, string> = {
    include_email: 'true'
  };
  let signature = createSignature({
    apiUrl,
    consumerKey: env.CONSUMER_KEY,
    consumerSecret: env.CONSUMER_SECRET,
    oauthToken: twitterSession.oauthToken,
    oauthTokenSecret: twitterSession.oauthTokenSecret,
    method: 'GET',
    qs
  });
  let search = new URLSearchParams(qs);
  let res = await fetch(`${apiUrl}?${search.toString()}`, {
    headers: {
      Authorization: `OAuth ${signature}`
    }
  });
  if (!res.ok) {
    console.error(
      `Twitter verify credentials error: [${res.status}] ${await res.text()}`
    );
    return new Response('', { status: res.status });
  }
  const { name, screen_name: screenName, email } = await res.json();

  const follows = {
    [TWITTER_ACCOUNT_ID]: false,
    [TWITTER_ACCOUNT_ID_HUMANGUILD]: false,
    [TWITTER_ACCOUNT_ID_NEAR_GAMES]: false,
    [TWITTER_ACCOUNT_ID_NEAR_PROTOCOL]: false,
    [TWITTER_ACCOUNT_ID_NNC]: false,
    [TWITTER_ACCOUNT_ID_FSC]: false,
    [TWITTER_ACCOUNT_ID_ASAC]: false
  };
  const isFollowingRes = await checkIsFollowing(twitterSession, follows, env);
  if (isFollowingRes instanceof Response) {
    return isFollowingRes;
  }
  const isFollowing = follows[TWITTER_ACCOUNT_ID];
  const isFollowingHumanguild = follows[TWITTER_ACCOUNT_ID_HUMANGUILD];
  const isFollowingNEARGames = follows[TWITTER_ACCOUNT_ID_NEAR_GAMES];
  const isFollowingNEARProtocol = follows[TWITTER_ACCOUNT_ID_NEAR_PROTOCOL];
  const isFollowingNNC = follows[TWITTER_ACCOUNT_ID_NNC];
  const isFollowingFSC = follows[TWITTER_ACCOUNT_ID_FSC];
  const isFollowingASAC = follows[TWITTER_ACCOUNT_ID_ASAC];

  apiUrl = `https://api.twitter.com/1.1/statuses/user_timeline.json`;
  qs = {
    count: '200',
    include_rts: 'true',
    exclude_replies: 'true',
    trim_user: 'true'
  };
  signature = createSignature({
    apiUrl,
    consumerKey: env.CONSUMER_KEY,
    consumerSecret: env.CONSUMER_SECRET,
    oauthToken: twitterSession.oauthToken,
    oauthTokenSecret: twitterSession.oauthTokenSecret,
    method: 'GET',
    qs
  });
  search = new URLSearchParams(qs);
  res = await fetch(`${apiUrl}?${search.toString()}`, {
    headers: {
      Authorization: `OAuth ${signature}`
    }
  });
  if (!res.ok) {
    console.error(
      `Twitter GET user timeline error: [${res.status}] ${await res.text()}`
    );
    return new Response('', { status: res.status });
  }
  const retweets: Retweet[] = await res.json();
  const retweeted = !!retweets.find(({ entities, quoted_status }) => {
    if (quoted_status?.id_str !== env.RETWEET_ID) {
      return false;
    }
    const includedHashTags = entities.hashtags.map(h => h.text.toLowerCase());
    return REQUIRED_RT_HASHTAGS.every(
      req => includedHashTags.indexOf(req) !== -1
    );
  });

  apiUrl = `https://api.twitter.com/1.1/favorites/list.json`;
  qs = {
    count: '1',
    max_id: env.RETWEET_ID,
    include_entities: 'false'
  };
  signature = createSignature({
    apiUrl,
    consumerKey: env.CONSUMER_KEY,
    consumerSecret: env.CONSUMER_SECRET,
    oauthToken: twitterSession.oauthToken,
    oauthTokenSecret: twitterSession.oauthTokenSecret,
    method: 'GET',
    qs
  });
  search = new URLSearchParams(qs);
  res = await fetch(`${apiUrl}?${search.toString()}`, {
    headers: {
      Authorization: `OAuth ${signature}`
    }
  });
  if (!res.ok) {
    console.error(
      `Twitter GET favorites list: [${res.status}] ${await res.text()}`
    );
    return new Response('', { status: res.status });
  }
  const likes: LikedTweet[] = await res.json();
  const liked = likes[0]?.id_str === env.RETWEET_ID;

  const user: TwitterUser = {
    name,
    screenName,
    verified: !!email,
    isFollowing,
    isFollowingHumanguild,
    isFollowingNEARGames,
    isFollowingNEARProtocol,
    isFollowingNNC,
    isFollowingFSC,
    isFollowingASAC,
    retweeted,
    liked
  };

  const addr = env.TWITTER.idFromName(user.screenName);
  const obj = env.TWITTER.get(addr);
  const objRes = await obj.fetch(req.url, {
    method: 'PUT',
    body: JSON.stringify(user)
  });
  if (!objRes.ok) {
    console.error(
      `Twitter PUT durable object error: [${
        objRes.status
      }] ${await objRes.text()}`
    );
    return new Response('', { status: 400 });
  }

  return user;
}

async function checkIsFollowing(
  twitterSession: TwitterSession,
  accounts: Record<string, boolean>,
  env: Env
): Promise<undefined | Response> {
  const apiUrl = `https://api.twitter.com/1.1/friendships/lookup.json`;
  const qs = {
    user_id: Object.keys(accounts).join(',')
  };

  const signature = createSignature({
    apiUrl,
    consumerKey: env.CONSUMER_KEY,
    consumerSecret: env.CONSUMER_SECRET,
    oauthToken: twitterSession.oauthToken,
    oauthTokenSecret: twitterSession.oauthTokenSecret,
    method: 'GET',
    qs
  });
  const search = new URLSearchParams({
    user_id: Object.keys(accounts).join(',')
  });
  const res = await fetch(`${apiUrl}?${search.toString()}`, {
    headers: {
      Authorization: `OAuth ${signature}`
    }
  });
  if (!res.ok) {
    console.error(
      `Twitter GET friendships error: [${res.status}] ${await res.text()}`
    );
    return new Response('', { status: res.status });
  }
  const follows: { connections: ('following' | string)[]; id_str: string }[] =
    await res.json();
  for (const accountId in accounts) {
    const isFollowing = !!follows.find(
      ({ connections, id_str }) =>
        id_str === accountId && connections.includes('following')
    );
    accounts[accountId] = isFollowing;
  }
}

export class Twitter {
  private state: DurableObjectState;
  private initializePromise: Promise<void> | undefined;
  private user?: TwitterUser | null;
  private router: Router<unknown>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.user = null;
    this.router = Router()
      .get('/nftdrop/*', async () => {
        if (!this.user || !isTwitterUserOk(this.user)) {
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
        const user: TwitterUser = await req.json();
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
