import 'ses';

lockdown();

let receivedMessage = null;

// Host-side synchronous receiver
function sendToHost(type, payload) {
  console.log(`[Host received sync]:`, type, payload);
  receivedMessage = { type, payload };
  
  // You can also compute and synchronously return a value back into the compartment
  return { status: 'acknowledged', timestamp: Date.now() };
}

// Pass the bridge function to the compartment
const c = new Compartment({
  globals: {
    sendToHost,
  },
  __options__: true,
});

// Inside the compartment:
const result = c.evaluate(`
  // Synchronous invocation
  const response = globalThis.sendToHost('USER_LOGIN', { userId: 42 });
  response;
`);

console.log('Returned into compartment:', result);
console.log('Host state:', receivedMessage);
