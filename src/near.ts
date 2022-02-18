import { Account, connect, KeyPair, keyStores } from 'near-api-js';

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
