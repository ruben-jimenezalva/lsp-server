import {
	_Connection,
} from 'vscode-languageserver/node';

const helloWorldProtocol = 'custom/helloWorld';

export function activate(connection : _Connection){
	connection.onNotification(helloWorldProtocol, ()=>{
		const word = '¡Hello World from Server!';
		connection.sendNotification(helloWorldProtocol, word);
	});
}