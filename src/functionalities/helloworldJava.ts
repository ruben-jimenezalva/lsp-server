import {
	_Connection,
} from 'vscode-languageserver/node';

import * as path from 'path';
import * as child_process from 'child_process';

const helloWorldJavaProtocol = 'custom/helloWorldJava';

export function activate(connection: _Connection) {
	connection.onNotification(helloWorldJavaProtocol, () => {
		const path1 = path.join(__dirname, '../../','helloworld.jar');
		const childProcess = child_process.exec('java -jar ' + path1 + ' "Jar is invoked by Node js"', function (err: any, stdout: any, stderr: any) {
			if (err) {
				console.log(err);
			} else {
				connection.sendNotification(helloWorldJavaProtocol, stdout);
			}
		});
	});
}