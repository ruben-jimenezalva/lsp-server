import {
	_Connection,
} from 'vscode-languageserver/node';

import * as path from 'path';
import * as child_process from 'child_process';

const replaceOldDoLoopsProtocol = 'custom/replaceOldDoLoops';

export function activate(connection : _Connection){
	connection.onNotification(replaceOldDoLoopsProtocol, (filename)=>{
		const photranCmdLine = path.join(__dirname, '../../','org.eclipse.photran.cmdline/PhotranCmdLine.jar');
		const javaCommand = `java -jar ${photranCmdLine} replaceOldStyleDoLoop ${filename}`;
		const childProcess = child_process.exec(javaCommand, function (err: any, stdout: any, stderr: any) {
			if (err) {
				//TODO informar errores al cliente
				console.log(err);
			} else {
				connection.sendNotification(replaceOldDoLoopsProtocol, stdout);
			}
		});
	});
}