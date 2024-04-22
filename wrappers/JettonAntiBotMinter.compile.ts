import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    targets: [
        'contracts/imports/stdlib.fc',
        'contracts/imports/fees.fc',
        'contracts/params.fc',
        'contracts/op-codes.fc',
        'contracts/jetton-utils.fc',
        'contracts/jetton-anti-bot-minter.fc',
    ],
};