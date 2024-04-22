import { toNano } from '@ton/core';
import { JettonAntiBotMinter } from '../wrappers/JettonAntiBotMinter';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const jettonAntiBotMinter = provider.open(JettonAntiBotMinter.createFromConfig({}, await compile('JettonAntiBotMinter')));

    await jettonAntiBotMinter.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(jettonAntiBotMinter.address);

    // run methods on `jettonAntiBotMinter`
}
