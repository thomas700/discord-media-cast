import { app } from 'electron';
console.log('App Name:', app.name);
console.log('User Data:', app.getPath('userData'));
console.log('Got Lock:', app.requestSingleInstanceLock());
app.quit();
