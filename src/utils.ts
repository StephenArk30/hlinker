import rl from 'readline';
import fs from 'fs';

export function confirm(message: string) {
  const readline = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    const ask = () => {
      readline.question(`${message} (Y/n) `, (answer) => {
        const normalized = answer.trim().toLowerCase();
        if (normalized === 'y' || normalized === '') {
          readline.close();
          resolve(true);
        } else if (normalized === 'n') {
          readline.close();
          resolve(false);
        } else {
          ask();
        }
      });
    };
    ask();
  });
}

export const readFile = (filePath: string) => fs.readFileSync(filePath, 'utf8');
export const readJSON = (filePath: string) => JSON.parse(readFile(filePath));
export const writeJSON = (filePath: string, data: object) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
