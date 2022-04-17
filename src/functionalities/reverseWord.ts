import {
	_Connection,
} from 'vscode-languageserver/node';

const reverseWordProtocol = 'custom/reverseWord';

export function activate(connection : _Connection){
	connection.onNotification(reverseWordProtocol, (word)=>{
		const reversed = word.split('').reverse().join('');
		connection.sendNotification(reverseWordProtocol, reversed);
	});
}