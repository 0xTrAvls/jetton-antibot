import { compile, NetworkProvider } from '@ton/blueprint';
import { Address, toNano } from '@ton/core';
import { promptAddress, promptUrl } from "../helpers/utils";
import { jettonAntiBotContentToCell, JettonAntiBotMinter } from '../wrappers/JettonAntiBotMinter';


export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const urlPrompt = `Please specify content `;
    const contentUrl = await promptUrl(urlPrompt, ui);

    const content = jettonAntiBotContentToCell({
        type: 1,
        uri: contentUrl,
    });

    const contract = provider.open(JettonAntiBotMinter.createFromConfig({
        admin: provider.sender().address!,
        anti_bot_address: Address.parse('EQCdFzCjGyYzryFJu_Q9jDXAQwahCs_CzRhHYyg1bGnteUmZ'),
        content: content,
        wallet_code: await compile('JettonAntiBotWallet'),
    }, await compile('JettonAntiBotMinter')));

    await contract.sendMint(provider.sender(), provider.sender().address!, 1000n, toNano(0.1), toNano(0.2));


}