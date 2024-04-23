import { toNano } from '@ton/core';
import { AntiBot, AntiBotConfig, antiBotConfigToCell } from '../wrappers/AntiBot';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const antiBot = provider.open(AntiBot.createFromConfig({
        owner: provider.sender().address!,
        amount_limit_per_trade: 20n,
        amount_limit_per_block: 10000n,
        time_limit_per_trade: 10n,
        disable_time: 100000n
    }, await compile('AntiBot')));

    await antiBot.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(antiBot.address);

    // run methods on `jettonAntiBotMinter`
}
