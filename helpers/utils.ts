import { compile, NetworkProvider, UIProvider } from '@ton/blueprint';
import { Address, toNano } from '@ton/core';

export const getTimeInSecondsFromSpecificDate = (date: Date): number => {
    return Math.floor(date.getTime() / 1000);
};
export const addOneDay = (date: Date): Date => {
    const newDate = new Date(date);
    newDate.setDate(date.getDate() + 1);
    return newDate;
};
export const promptAddress = async (prompt: string, provider: UIProvider) => {
    let promptFinal = prompt;
    do {
        let testAddr = (await provider.input(promptFinal)).replace(/^\s+|\s+$/g, '');
        try {
            return Address.parse(testAddr);
        } catch (e) {
            provider.write(testAddr + ' is not valid!\n');
            prompt = 'Please try again:';
        }
    } while (true);
};

export const promptBool = async (prompt:string, options:[string, string], ui:UIProvider, choice: boolean = false) => {
    let yes  = false;
    let no   = false;
    let opts = options.map(o => o.toLowerCase());

    do {
        let res = (choice ? await ui.choose(prompt, options, (c: string) => c) : await ui.input(`${prompt}(${options[0]}/${options[1]})`)).toLowerCase();
        yes = res == opts[0]
        if(!yes)
            no  = res == opts[1];
    } while(!(yes || no));

    return yes;
}


export const promptUrl = async(prompt:string, ui:UIProvider) => {
    let retry  = false;
    let input  = "";
    let res    = "";

    do {
        input = await ui.input(prompt);
        try{
            let testUrl = new URL(input);
            res   = testUrl.toString();
            retry = false;
        }
        catch(e) {
            ui.write(input + " doesn't look like a valid url:\n" + e);
            retry = !(await promptBool('Use anyway?(y/n)', ['y', 'n'], ui));
        }
    } while(retry);
    return input;
}

export const CodeType = {
    Launchpad: 1n,
    LaunchpadOverflow: 2n,
};

export const CodeTokenType = {
    Standard: 1n,
}

export const CodeTokenWalletType = {
    Standard: 1n,
}
