import { saveSettingsDebounced } from '../../../script.js';
import { extension_settings, getContext } from '../../extensions.js';
import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from '../../slash-commands/SlashCommandArgument.js';

const EXTENSION_NAME = 'npc-bank';
const DEFAULT_SETTINGS = {
    enabled: true,
    personal_accounts: {},
};

let settings = DEFAULT_SETTINGS;

// ========== HELPERS ==========

function getBankKey(chatId, characterName) {
    return `${chatId}::${characterName}`;
}

function ensureAccount(chatId, characterName) {
    const key = getBankKey(chatId, characterName);
    if (!settings.personal_accounts[key]) {
        settings.personal_accounts[key] = { balance: 0, owner: characterName };
    }
    return settings.personal_accounts[key];
}

function getCurrentCharacterName() {
    const context = getContext();
    if (context && context.characters && context.characterId !== undefined) {
        return context.characters[context.characterId]?.name || 'Unknown';
    }
    return 'Unknown';
}

function getCurrentChatId() {
    const context = getContext();
    return context?.chatId || 'default';
}

function formatCurrency(amount) {
    return `${Number(amount).toLocaleString()} gold`;
}

// ========== /bank-balance ==========

SlashCommand.addCommand('bank-balance', {
    description: 'Check the bank balance of the current character.',
    callback: (args) => {
        const chatId = getCurrentChatId();
        const charName = getCurrentCharacterName();
        const targetName = args?.name ? String(args.name) : charName;
        const account = ensureAccount(chatId, targetName);
        return `💰 **${targetName}'s Bank Balance:** ${formatCurrency(account.balance)}`;
    },
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({
            name: 'name', description: 'Character name (default: current)',
            typeList: [ARGUMENT_TYPE.STRING], isRequired: false,
        }),
    ],
    helpString: `<b>/bank-balance</b> – Check a character's bank balance.<br>Example: <code>/bank-balance name:Megumin</code>`,
});

// ========== /bank-deposit ==========

SlashCommand.addCommand('bank-deposit', {
    description: 'Deposit gold into an account.',
    callback: (args) => {
        const chatId = getCurrentChatId();
        const targetName = args?.name ? String(args.name) : getCurrentCharacterName();
        const amount = args?.amount ? parseInt(args.amount) : 0;
        if (isNaN(amount) || amount <= 0) return '⚠️ Enter a valid positive amount.';
        const account = ensureAccount(chatId, targetName);
        account.balance += amount;
        saveSettingsDebounced();
        return `✅ Deposited ${formatCurrency(amount)} into **${targetName}'s** account. New balance: ${formatCurrency(account.balance)}`;
    },
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({ name: 'name', description: 'Character name', typeList: [ARGUMENT_TYPE.STRING], isRequired: false }),
        SlashCommandNamedArgument.fromProps({ name: 'amount', description: 'Amount of gold', typeList: [ARGUMENT_TYPE.NUMBER], isRequired: true }),
    ],
    helpString: `<b>/bank-deposit</b> – Deposit gold.<br>Example: <code>/bank-deposit amount:500 name:Megumin</code>`,
});

// ========== /bank-withdraw ==========

SlashCommand.addCommand('bank-withdraw', {
    description: 'Withdraw gold from an account.',
    callback: (args) => {
        const chatId = getCurrentChatId();
        const targetName = args?.name ? String(args.name) : getCurrentCharacterName();
        const amount = args?.amount ? parseInt(args.amount) : 0;
        if (isNaN(amount) || amount <= 0) return '⚠️ Enter a valid positive amount.';
        const account = ensureAccount(chatId, targetName);
        if (account.balance < amount) return `❌ Insufficient funds! **${targetName}** has ${formatCurrency(account.balance)}.`;
        account.balance -= amount;
        saveSettingsDebounced();
        return `✅ Withdrew ${formatCurrency(amount)} from **${targetName}'s** account. Remaining: ${formatCurrency(account.balance)}`;
    },
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({ name: 'name', description: 'Character name', typeList: [ARGUMENT_TYPE.STRING], isRequired: false }),
        SlashCommandNamedArgument.fromProps({ name: 'amount', description: 'Amount of gold', typeList: [ARGUMENT_TYPE.NUMBER], isRequired: true }),
    ],
    helpString: `<b>/bank-withdraw</b> – Withdraw gold.<br>Example: <code>/bank-withdraw amount:200 name:Megumin</code>`,
});

// ========== /bank-transfer ==========

SlashCommand.addCommand('bank-transfer', {
    description: 'Transfer gold between characters.',
    callback: (args) => {
        const chatId = getCurrentChatId();
        const fromName = args?.from ? String(args.from) : null;
        const toName = args?.to ? String(args.to) : null;
        const amount = args?.amount ? parseInt(args.amount) : 0;
        if (!fromName || !toName) return '⚠️ Specify both <b>from</b> and <b>to</b> names.';
        if (fromName === toName) return '⚠️ Cannot transfer to the same account.';
        if (isNaN(amount) || amount <= 0) return '⚠️ Enter a valid positive amount.';
        const fromAccount = ensureAccount(chatId, fromName);
        const toAccount = ensureAccount(chatId, toName);
        if (fromAccount.balance < amount) return `❌ Insufficient funds! **${fromName}** has ${formatCurrency(fromAccount.balance)}.`;
        fromAccount.balance -= amount;
        toAccount.balance += amount;
        saveSettingsDebounced();
        return `✅ Transferred ${formatCurrency(amount)} from **${fromName}** to **${toName}**.\n💰 ${fromName}: ${formatCurrency(fromAccount.balance)} → ${toName}: ${formatCurrency(toAccount.balance)}`;
    },
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({ name: 'from', description: 'Sender name', typeList: [ARGUMENT_TYPE.STRING], isRequired: true }),
        SlashCommandNamedArgument.fromProps({ name: 'to', description: 'Recipient name', typeList: [ARGUMENT_TYPE.STRING], isRequired: true }),
        SlashCommandNamedArgument.fromProps({ name: 'amount', description: 'Gold amount', typeList: [ARGUMENT_TYPE.NUMBER], isRequired: true }),
    ],
    helpString: `<b>/bank-transfer</b> – Transfer gold.<br>Example: <code>/bank-transfer from:Megumin to:Yunyun amount:500</code>`,
});

// ========== /bank-list ==========

SlashCommand.addCommand('bank-list', {
    description: 'List all bank accounts in the current chat.',
    callback: () => {
        const chatId = getCurrentChatId();
        const accounts = [];
        for (const [key, account] of Object.entries(settings.personal_accounts)) {
            if (key.startsWith(`${chatId}::`)) accounts.push({ name: account.owner, balance: account.balance });
        }
        if (!accounts.length) return '🏦 No bank accounts in this chat.';
        accounts.sort((a, b) => b.balance - a.balance);
        let output = '🏦 **Bank Accounts:**\n\n';
        accounts.forEach(a => { output += `- **${a.name}**: ${formatCurrency(a.balance)}\n`; });
        return output;
    },
    helpString: `<b>/bank-list</b> – List all accounts in the current chat.`,
});

// ========== /bank-set ==========

SlashCommand.addCommand('bank-set', {
    description: 'Directly set a character\'s balance.',
    callback: (args) => {
        const chatId = getCurrentChatId();
        const targetName = args?.name ? String(args.name) : getCurrentCharacterName();
        const amount = args?.amount ? parseInt(args.amount) : 0;
        if (isNaN(amount) || amount < 0) return '⚠️ Enter a valid non-negative amount.';
        const account = ensureAccount(chatId, targetName);
        account.balance = amount;
        saveSettingsDebounced();
        return `✅ Set **${targetName}'s** balance to ${formatCurrency(amount)}.`;
    },
    namedArgumentList: [
        SlashCommandNamedArgument.fromProps({ name: 'name', description: 'Character name', typeList: [ARGUMENT_TYPE.STRING], isRequired: false }),
        SlashCommandNamedArgument.fromProps({ name: 'amount', description: 'New balance', typeList: [ARGUMENT_TYPE.NUMBER], isRequired: true }),
    ],
    helpString: `<b>/bank-set</b> – Set balance directly.<br>Example: <code>/bank-set amount:5000 name:Megumin</code>`,
});

// ========== /bank-reset ==========

SlashCommand.addCommand('bank-reset', {
    description: 'Reset all bank accounts in the current chat.',
    callback: () => {
        const chatId = getCurrentChatId();
        const toRemove = Object.keys(settings.personal_accounts).filter(k => k.startsWith(`${chatId}::`));
        toRemove.forEach(k => delete settings.personal_accounts[k]);
        saveSettingsDebounced();
        return '🗑️ All bank accounts in this chat reset.';
    },
    helpString: `<b>/bank-reset</b> – Deletes all accounts in the current chat. Cannot be undone!`,
});

// ========== LIFECYCLE ==========

jQuery(async () => {
    const stored = extension_settings[EXTENSION_NAME];
    if (stored) Object.assign(settings, stored);
    if (typeof settings.personal_accounts !== 'object' || settings.personal_accounts === null) {
        settings.personal_accounts = {};
    }
    console.log('[NPC Bank] Loaded! Commands: /bank-balance, /bank-deposit, /bank-withdraw, /bank-transfer, /bank-list, /bank-set, /bank-reset');
});
