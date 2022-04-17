/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';


import * as reverseWord from './functionalities/reverseWord';
import * as helloworld from './functionalities/helloworld';
import * as helloworldJava from './functionalities/helloworldJava';
import * as replaceOldDoLoops from './functionalities/replaceOldDoLoops';

import * as path from 'path';
import {exec} from "child_process";
import { resolve } from 'path';

interface Declaration {
	variable: string;
	offset: number;
	line: number;
	alreadyDefined: boolean;
	redefinitions: Array<Declaration>
	firstDefinition: Declaration	| null
}

const newLineExpression = /\r\n|\n\r|\n|\r/g;

const grepAndRemoveDuplicatedLines = (text: string, greptext: string): Array<string> => {
	const result: Array<string> = [];
	const blocker : {[index: string]:any} = {}; // prevents lines dupplication
	const lines = text.split(newLineExpression).map(l => l.trim());
	for (const line of lines) {
		// eslint-disable-next-line no-prototype-builtins
		if (blocker.hasOwnProperty(line) || !line.includes(greptext)) {
			continue;
		}
		blocker[line] = true;
		result.push(line);
	}
	return result;
};




const getVariableDeclarations = (photranCmdLinePath: string, filePath: string): Promise<Array<Declaration>> => {
	
	const javaCommand = `java -jar ${photranCmdLinePath} ${filePath}`;


	return new Promise((resolve, reject) => {
		const declarations: Array<Declaration> = [];
		exec(javaCommand, function (err: any, stdout: any, stderr: any) {
			if (err) {
				reject(err);
			} else {
				//const filename = filePath.split('\\')!.pop().split('/').pop() as string;
				const filename = 'bstfit.f90';
				const arr = grepAndRemoveDuplicatedLines(stdout, filename);
				//console.log(stdout);

				const myMap = new Map();

				arr.forEach(line => {
						
					const data = line.split(" ");
					const next: Declaration = { 
						variable: data[0],
						offset: +line.match(new RegExp("offset" + '\\s(\\w+)'))![1],
						line: +line.match(new RegExp("line" + '\\s(\\w+)'))![1],
						alreadyDefined: myMap.has(data[0]),
						redefinitions: [],
						firstDefinition: null 
					};

					if (next.alreadyDefined) {
						const existing = myMap.get(data[0]);
						existing.redefinitions.push(next);
						next.firstDefinition = existing;
						console.log(`Variable: ${next.variable} Offset: ${next.offset} Line: ${next.line} ALREADY DEFINED at line ${existing.line}`);
					} else {
						myMap.set(data[0], next);

						console.log(`Variable: ${next.variable} Offset: ${next.offset} Line: ${next.line}`);
					}
					
					declarations.push(next);

				});
				resolve(declarations);
			}
		});
	});
};


// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	//validateTextDocument(change.document);
	console.log("onDidChangeContent");
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	const diagnostics: Diagnostic[] = [];
	while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		problems++;
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length)
			},
			message: `${m[0]} is all uppercase.`,
			source: 'ex'
		};
		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Spelling matters'
				},
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Particularly for names'
				}
			];
		}
		diagnostics.push(diagnostic);
	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		return [
			{
				label: 'TypeScript',
				kind: CompletionItemKind.Text,
				data: 1
			},
			{
				label: 'JavaScript',
				kind: CompletionItemKind.Text,
				data: 2
			}
		];
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			item.detail = 'TypeScript details';
			item.documentation = 'TypeScript documentation';
		} else if (item.data === 2) {
			item.detail = 'JavaScript details';
			item.documentation = 'JavaScript documentation';
		}
		return item;
	}
);

async function validateFortranDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);

	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const uri2path = require('file-uri-to-path');

	const filePath = (uri2path(textDocument.uri) as string).replace("%3A", ":");
	const photranCmdLinePath = path.join(__dirname, '../','org.eclipse.photran.cmdline/photran-cmdline-moredefs.jar');

	getVariableDeclarations(photranCmdLinePath, filePath).then( (declarations) => {

		// The validator creates diagnostics for all variable declared more than once
		let m: RegExpExecArray | null;

		let problems = 0;
		const diagnostics: Diagnostic[] = [];
		for (let i = 0; i < declarations.length; i++) {
			const declaration = declarations[i];
			if (declaration.alreadyDefined)
			{
				problems++;
				const diagnostic: Diagnostic = {
					severity: DiagnosticSeverity.Warning,
					range: {
						start: textDocument.positionAt(declaration.offset),
						end: textDocument.positionAt(declaration.offset + declaration.variable.length)
					},
					message: `${declaration.variable} at line ${declaration.line} is already defined in line ${declaration.firstDefinition?.line}.`,
					source: 'ex'
				};

				

				diagnostics.push(diagnostic);

				if (problems > 50) break;
			}
			
		}

		// Send the computed diagnostics to VSCode.
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	});
}


documents.onDidSave(t => {
	validateFortranDocument(t.document);
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();


//Server Functionalities
reverseWord.activate(connection);
helloworld.activate(connection);
helloworldJava.activate(connection);
replaceOldDoLoops.activate(connection);