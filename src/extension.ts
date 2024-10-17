// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


import axios, { AxiosResponse } from 'axios';
import { exec } from 'child_process';
const humanizeDuration = require("humanize-duration");


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "gl-issues" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const configure = vscode.commands.registerCommand('gl-issues.configure', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		//vscode.window.showInformationMessage('Hello from GitLab Issues!\r\nPlease input your access information');
		await promptForUsername();
		await promptForToken();
	});

	const listIssues = vscode.commands.registerCommand('gl-issues.listIssues', async () => {
		await fetchIssues();
	});

	const logTime = vscode.commands.registerCommand('gl-issues.logTime', async () => {
		const ret = await logTimeOnIssue();
		if (ret.human_total_time_spent) {
			vscode.window.showInformationMessage(`Tempo total na Issue: ${ret.human_total_time_spent}`);
		}
	});


	const startIssue = vscode.commands.registerCommand('gl-issues.startIssue', async () => {
		await startWorkIssue();
	});

	const stopIssue = vscode.commands.registerCommand('gl-issues.stopIssue', async () => {
		await stopWorkIssue();
	});

	const spentIssue = vscode.commands.registerCommand('gl-issues.spentIssue', async () => {
		await spentWorkIssue();
	});

	context.subscriptions.push(configure);
	context.subscriptions.push(listIssues);
	context.subscriptions.push(logTime);
	context.subscriptions.push(startIssue);
	context.subscriptions.push(stopIssue);
	context.subscriptions.push(spentIssue);
}












// Função para solicitar o nome de usuário
async function promptForUsername(): Promise<string | undefined> {
	const username = await vscode.window.showInputBox({
		prompt: 'Digite seu nome de usuário do GitLab',
		ignoreFocusOut: true
	});
	return username;
}

// Função para solicitar o token de acesso privado
async function promptForToken(): Promise<string | undefined> {
	const token = await vscode.window.showInputBox({
		prompt: 'Digite seu Token de Acesso Privado do GitLab',
		password: true, // Esconde o token enquanto o usuário digita
		ignoreFocusOut: true
	});
	return token;
}

// Função para salvar as credenciais
async function storeCredentials(username: string, token: string) {
	// Aqui você pode usar o keytar para armazenar de forma segura o token (requer instalação de keytar)
	await vscode.workspace.getConfiguration().update('gl-issues.username', username, vscode.ConfigurationTarget.Global);
	await vscode.workspace.getConfiguration().update('gl-issues.token', token, vscode.ConfigurationTarget.Global);
}

// Função para obter as credenciais salvas
function getStoredCredentials() {
	const username = vscode.workspace.getConfiguration().get('gl-issues.username');
	const token = vscode.workspace.getConfiguration().get('gl-issues.token');
	return { username, token };
}


function getWorkIssue() {
	const projectId = vscode.workspace.getConfiguration().get('gl-issues.issue.projectId') as string;
	const iid = vscode.workspace.getConfiguration().get('gl-issues.issue.iid') as string;
	const date = vscode.workspace.getConfiguration().get('gl-issues.issue.date') as number;
	const time = vscode.workspace.getConfiguration().get('gl-issues.issue.time') as number;

	return { projectId, iid, date, time };
}


// Função para salvar as credenciais
async function storeWorkIssue(projectId: string, iid: string, date: number, time: number) {
	// Aqui você pode usar o keytar para armazenar de forma segura o token (requer instalação de keytar)
	await vscode.workspace.getConfiguration().update('gl-issues.issue.projectId', projectId, vscode.ConfigurationTarget.Workspace);
	await vscode.workspace.getConfiguration().update('gl-issues.issue.iid', iid, vscode.ConfigurationTarget.Workspace);
	await vscode.workspace.getConfiguration().update('gl-issues.issue.date', date, vscode.ConfigurationTarget.Workspace);
	await vscode.workspace.getConfiguration().update('gl-issues.issue.time', time, vscode.ConfigurationTarget.Workspace);
}








async function fetchIssues() {
	// Verifica se há credenciais salvas
	let { username, token } = getStoredCredentials();

	// Se não tiver credenciais, solicita ao usuário
	if (!username || !token) {
		username = await promptForUsername();
		token = await promptForToken();

		if (username && token) {
			// Armazena as credenciais
			await storeCredentials(username as string, token as string);
		} else {
			vscode.window.showErrorMessage('Usuário ou Token não fornecidos!');
			return;
		}
	}

	try {
		let projectId = await getGitLabProjectId(token as string);
		let server = await getGitLabServer(token as string);

		const response = await axios.get(`https://${server}/api/v4/projects/${projectId}/issues`, {
			headers: { 'Authorization': `Bearer ${token}` }
		});

		return response.data;
	} catch (error: any) {
		vscode.window.showErrorMessage('Erro ao buscar issues: ' + error.message);
	}
}



// Função para exibir as issues como uma lista para o usuário selecionar
async function selectIssue(issues: any[]): Promise<any | undefined> {
	// Converte as issues em uma lista de opções para o Quick Pick
	const issueItems = issues.map(issue => ({
		label: `#${issue.iid} ${issue.title}`,
		description: issue.state,
		issue
	}));

	// Exibe o Quick Pick para o usuário escolher
	const selectedIssue = await vscode.window.showQuickPick(issueItems, {
		placeHolder: 'Selecione a issue para registrar o tempo'
	});

	return selectedIssue ? selectedIssue.issue : undefined;
}


async function logTimeForIssue(issueIid: string, timeSpent: string) {

	// Verifica se há credenciais salvas
	let { username, token } = getStoredCredentials();

	// Se não tiver credenciais, solicita ao usuário
	if (!username || !token) {
		username = await promptForUsername();
		token = await promptForToken();

		if (username && token) {
			// Armazena as credenciais
			await storeCredentials(username as string, token as string);
		} else {
			vscode.window.showErrorMessage('Usuário ou Token não fornecidos!');
			return;
		}
	}

	try {
		let projectId = await getGitLabProjectId(token as string);
		let server = await getGitLabServer(token as string);


		const response = await axios.post(
			`https://${server}/api/v4/projects/${projectId}/issues/${issueIid}/add_spent_time`,
			{ duration: timeSpent },
			{ headers: { 'Authorization': `Bearer ${token}` } }
		);

		return response.data;
	} catch (error: any) {
		vscode.window.showErrorMessage('Erro ao registrar tempo na issue: ' + error.message);
	}
}



async function logTimeOnIssue() {

	// Verifica se há credenciais salvas
	let { username, token } = getStoredCredentials();

	// Se não tiver credenciais, solicita ao usuário
	if (!username || !token) {
		username = await promptForUsername();
		token = await promptForToken();

		if (username && token) {
			// Armazena as credenciais
			await storeCredentials(username as string, token as string);
		} else {
			vscode.window.showErrorMessage('Usuário ou Token não fornecidos!');
			return;
		}
	}

	try {
		let projectId = await getGitLabProjectId(token as string);
		let server = await getGitLabServer(token as string);

		const issues = await fetchIssues();
		if (issues.length === 0) {
			vscode.window.showErrorMessage('Nenhuma issue disponível.');
			return;
		}

		const selectedIssue = await selectIssue(issues);

		if (!selectedIssue) {
			vscode.window.showErrorMessage('Nenhuma issue foi selecionada.');
			return;
		}

		// Solicita ao usuário o tempo gasto
		const timeSpent = await vscode.window.showInputBox({
			prompt: 'Digite o tempo gasto (ex: 1h30m)',
			placeHolder: 'Exemplo: 1h30m',
			ignoreFocusOut: true
		});

		return logTimeForIssue(selectedIssue.iid as string, timeSpent as string);
	} catch (error: any) {
		vscode.window.showErrorMessage('Erro ao buscar issues: ' + error.message);
	}
}




let workingIssue = setInterval(() => {
	updateWorkIssueTime();
}, 10000);


function updateWorkIssueTime() {

	let { projectId, iid, date, time } = getWorkIssue();

	const agora = new Date().getTime();

	if (date > 0 && (agora - date) > 30000) {
		startWorkIssue();

	} else {
		if (iid && iid !== "0" && iid !== "") {
			time += 10000;
			storeWorkIssue(projectId, iid, agora, time);
		}
	}
}

async function spentWorkIssue() {

	let { projectId, iid, date, time } = getWorkIssue();
	let timeSpent = humanizeDuration(time);
	vscode.window.showInformationMessage('Issue spent: ' + timeSpent);
}

async function stopWorkIssue() {
	let { projectId, iid, date, time } = getWorkIssue();

	// Verifica se há credenciais salvas
	let { username, token } = getStoredCredentials();

	// Se não tiver credenciais
	if (!username || !token) {
		vscode.window.showErrorMessage('Usuário ou Token não fornecidos!');
		return;
	}


	try {
		let projectId = await getGitLabProjectId(token as string);
		let server = await getGitLabServer(token as string);


		let timeSpent = humanizeDuration(time);

		const response = await axios.post(
			`https://${server}/api/v4/projects/${projectId}/issues/${iid}/add_spent_time`,
			{ duration: timeSpent },
			{ headers: { 'Authorization': `Bearer ${token}` } }
		);


		storeWorkIssue("", "", 0, 0);

		vscode.window.showInformationMessage('Issue completed in: ' + timeSpent);

	} catch (error: any) {
		vscode.window.showErrorMessage('Erro ao registrar tempo na issue: ' + error.message);
	}


}

async function startWorkIssue() {

	// Verifica se há credenciais salvas
	let { username, token } = getStoredCredentials();

	// Se não tiver credenciais, solicita ao usuário
	if (!username || !token) {
		username = await promptForUsername();
		token = await promptForToken();

		if (username && token) {
			// Armazena as credenciais
			await storeCredentials(username as string, token as string);
		} else {
			vscode.window.showErrorMessage('Usuário ou Token não fornecidos!');
			return;
		}
	}

	try {

		let { projectId, iid, date, time } = getWorkIssue();
		if (iid && iid !== "0" && iid !== "") {
			await stopWorkIssue();
		}

		let pId = await getGitLabProjectId(token as string);
		let server = await getGitLabServer(token as string);

		const issues = await fetchIssues();
		if (issues.length === 0) {
			vscode.window.showErrorMessage('Nenhuma issue disponível.');
			return;
		}

		const selectedIssue = await selectIssue(issues);

		if (!selectedIssue) {
			vscode.window.showErrorMessage('Nenhuma issue foi selecionada.');
			return;
		}


		storeWorkIssue(pId + "", selectedIssue.iid, new Date().getTime(), 0);

		vscode.window.showInformationMessage('Issue started');

	} catch (error: any) {
		vscode.window.showErrorMessage('Erro ao buscar issues: ' + error.message);
	}
}












// Função para executar o comando git e obter a URL do repositório remoto
async function getGitRemoteUrl(): Promise<string | undefined> {
	try {
		const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;

		if (!workspacePath) {
			vscode.window.showErrorMessage('Nenhum workspace aberto.');
			return undefined;
		}

		// Usar await com a Promise ao invés de lidar manualmente com resolve/reject
		const { stdout, stderr } = await execPromise('git remote get-url origin', { cwd: workspacePath });

		if (stderr) {
			vscode.window.showWarningMessage('Aviso ao obter a URL remota do repositório Git: ' + stderr);
		}

		return stdout.trim();
	} catch (err) {
		// Certifique-se de tratar o erro corretamente
		const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao executar comando Git.';
		vscode.window.showErrorMessage('Erro ao obter a URL remota do repositório Git: ' + errorMessage);
		return undefined;
	}
}

// Função utilitária para converter exec em uma Promise que pode ser usada com async/await
function execPromise(command: string, options: { cwd: string }): Promise<{ stdout: string, stderr: string }> {
	return new Promise((resolve, reject) => {
		exec(command, options, (err, stdout, stderr) => {
			if (err) {
				return reject(err);
			}
			resolve({ stdout, stderr });
		});
	});
}


// Função para extrair a URL do servidor do projeto a partir da URL do GitLab
function extractGitRemoteServer(gitUrl: string): string | undefined {
	// Exemplo de URL GitLab: git@gitlab.com:user/repo.git ou https://gitlab.com/user/repo.git
	let match = gitUrl.match(/(?:https:\/\/|git@|http:\/\/)([^:\/]+)/);
	if (match) {
		return match[1].replace("git@", "https://").replace("http://", "https://"); // Retorna "user/repo"
	}
	return undefined;
}

// Função para extrair o nome do projeto a partir da URL do GitLab
function extractProjectNameFromGitUrl(gitUrl: string): string | undefined {
	// Exemplo de URL GitLab: git@gitlab.com:user/repo.git ou https://gitlab.com/user/repo.git
	const server = extractGitRemoteServer(gitUrl) as string;

	return gitUrl.substring(gitUrl.lastIndexOf(server) + server?.length + 1).replace(".git", "");
}

// Função para obter o Project ID do GitLab a partir do nome do projeto
async function fetchGitLabProjectId(projectPath: string, token: string): Promise<number | undefined> {
	try {
		let server = await getGitLabServer(token as string);

		const response = await axios.get(`https://${server}/api/v4/projects/${encodeURIComponent(projectPath)}`, {
			headers: { 'Authorization': `Bearer ${token}` }
		});
		return response.data.id;
	} catch (error: any) {
		vscode.window.showErrorMessage('Erro ao buscar o Project ID no GitLab: ' + error.message);
		return undefined;
	}
}

// Função principal para obter o Project ID do GitLab
async function getGitLabProjectId(token: string): Promise<number | undefined> {
	const gitUrl = await getGitRemoteUrl();

	if (!gitUrl) {
		vscode.window.showErrorMessage('Nenhum repositório Git encontrado no projeto aberto.');
		return undefined;
	}

	const projectName = extractProjectNameFromGitUrl(gitUrl);

	if (!projectName) {
		vscode.window.showErrorMessage('Erro ao extrair o nome do projeto a partir da URL do Git.');
		return undefined;
	}

	const projectId = await fetchGitLabProjectId(projectName, token);

	return projectId;
}


// Função principal para obter a URL do servidor do GitLab
async function getGitLabServer(token: string): Promise<string | undefined> {
	const gitUrl = await getGitRemoteUrl();
	if (!gitUrl) {
		vscode.window.showErrorMessage('Nenhum repositório Git encontrado no projeto aberto.');
		return undefined;
	}

	const projectServer = extractGitRemoteServer(gitUrl);

	return projectServer;
}










// This method is called when your extension is deactivated
export function deactivate() { }
