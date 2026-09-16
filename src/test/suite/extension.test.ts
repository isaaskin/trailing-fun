import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	test('activates and registers its commands', async () => {
		const extension = vscode.extensions.getExtension('isaaskin.trailing-fun');
		assert.ok(extension, 'extension should be discoverable by id');
		await extension.activate();

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('trailing-fun.toggle'), 'toggle command should be registered');
		assert.ok(commands.includes('trailing-fun.showQuickMenu'), 'quick menu command should be registered');
	});
});