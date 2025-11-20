import { net, OnBeforeRequestListenerDetails, protocol, session } from "electron";
import { join } from "node:path";

import { pathToFileURL } from "node:url";

protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: {
    standard: true,
    secure: true,
    bypassCSP: false,
    allowServiceWorkers: false,
    corsEnabled: true,
    stream: true,
    codeCache: true,
  },
}]);

export const registerProtocols = () => {
  protocol.handle('app', (request) => {
    const reqUrl = new URL(request.url);

    switch (reqUrl.host) {
      case 'top':
        console.log(pathToFileURL(join(import.meta.dirname, '../renderer', reqUrl.pathname)).toString());
        return net.fetch(pathToFileURL(join(import.meta.dirname, '../renderer', reqUrl.pathname)).toString());
      default:
        return new Response("Not found", { status: 404 });
    }
  });

  session.defaultSession.webRequest.onBeforeRequest((request: OnBeforeRequestListenerDetails, callback) => {
    if (['http', 'https', 'file', 'ftp'].some((v) => request.url.startsWith(v))) {
      const { frame } = request;
      if (frame == null) {
        return callback({ cancel: true });
      }
      console.log(frame.url);



      // TODO: Handle permissions of each module. For now though...
      callback({ cancel: true });
    }
    callback({});
  });
};
