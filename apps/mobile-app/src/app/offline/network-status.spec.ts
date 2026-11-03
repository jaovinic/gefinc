import { TestBed } from '@angular/core/testing';
import { NETWORK_PORT, NetworkPort } from '../native/native-ports';
import { NetworkStatus } from './network-status';

describe('NetworkStatus', () => {
  function setup(port: Partial<NetworkPort>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: NETWORK_PORT, useValue: { initial: () => null, status: async () => true, onChange: async () => undefined, ...port } }],
    });
    return TestBed.inject(NetworkStatus);
  }

  it('começa pelo estado conhecido da porta (dublê) e acompanha as mudanças', async () => {
    let notify: (connected: boolean) => void = () => undefined;
    const status = setup({ initial: () => false, status: async () => false, onChange: async (l) => void (notify = l) });
    expect(status.online()).toBe(false);

    await status.start();
    notify(true);
    expect(status.online()).toBe(true);
    notify(false);
    expect(status.online()).toBe(false);
  });

  it('sem o plugin (falha ao consultar), vale o estado do navegador e não estoura erro', async () => {
    const status = setup({
      status: async () => {
        throw new Error('sem plugin');
      },
    });
    await expect(status.start()).resolves.toBeUndefined();
    expect(status.online()).toBe(navigator.onLine);
  });

  it('só começa a acompanhar uma vez', async () => {
    const onChange = jest.fn(async () => undefined);
    const status = setup({ onChange });
    await status.start();
    await status.start();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
