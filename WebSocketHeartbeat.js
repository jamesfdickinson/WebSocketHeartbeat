//Websocket wrapper with heartbeat, reconnect, max connect wait time 
//Based off of https://github.com/zimv/websocket-heartbeat-js
export default class WebSocketHeartbeat {
    constructor(opts) {
        if (!opts && !opts.url) throw new Error('url is required');

        this.opts = {
            url: opts.url,
            protocols: opts.protocols || '',
            pingTimeout: opts.pingTimeout || 15000,
            pongTimeout: opts.pongTimeout || 6000,
            connectTimeout: opts.connectTimeout || 4000,
            reconnectTimeout: opts.reconnectTimeout || 2000,
            pingMsg: opts.pingMsg || 'ping',
            pongMsg: opts.pongMsg || 'pong',
            repeatLimit: opts.repeatLimit || 2
        }

        this.ws = null;//websocket
        this.repeat = 0;
        this.connectTimeoutId = null;
        this.pingTimeoutId = null;
        this.pongTimeoutId = null;
        this.reconnectTimeoutId = null;

        //override hook function
        this.onclose = () => { };
        this.onerror = () => { };
        this.onopen = () => { };
        this.onmessage = () => { };
        this.onreconnect = () => { };
        this.createWebSocket();
    }
    get readyState() {
        if (!this.ws) return 0;
        return this.ws.readyState;
    }
    createWebSocket() {
        try {
            this.cleanupWebSocket();
            //create new websocket
            if (this.opts.protocols) this.ws = new WebSocket(this.opts.url, this.opts.protocols);
            else this.ws = new WebSocket(this.opts.url);
            this.initEventHandle();
            //timeout for connect
            this.connectTimeoutId = setTimeout(() => {
                //try to reconnect if no response.  
                let isReconnecting = this.reconnect();
                if (!isReconnecting) {
                    if (this.onerror) this.onerror("Websocket Connect timeout");
                }
            }, this.opts.connectTimeout);
        } catch (e) {

            throw e;
        }
    };
    cleanupWebSocket() {
        //clean up old websocket and event handler to it
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onclose = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.close();
            this.ws = null;
        }
    }
    initEventHandle() {
        this.ws.onclose = (e) => {
            let code = e ? e.code : null;
            switch (code) {
                case 1000:	// CLOSE_NORMAL
                    this.forbidReconnect = true;
                    this.heartReset();
                    if (this.onclose) this.onclose(e);
                    break;
                case 1005:	// No Reason given
                    this.forbidReconnect = true;
                    this.heartReset();
                    if (this.onclose) this.onclose(e);
                    break;
                default:	// Abnormal closure 1006 normally
                    this.reconnect();
                    break;
            }
        };
        this.ws.onerror = (event) => {
            clearTimeout(this.connectTimeoutId);
            console.warn('WebSocket error: ', event);
            let isReconnecting = this.reconnect();
            if (!isReconnecting) {
                if (this.onerror) this.onerror(event);
            }
        };
        this.ws.onopen = () => {
            this.repeat = 0;
            clearTimeout(this.connectTimeoutId);
            if (this.onopen) this.onopen();
            this.heartCheck();
        };
        this.ws.onmessage = (event) => {
            if (this.onmessage) this.onmessage(event);
            this.heartCheck();
            this.pong(event.data);
        };
    };

    reconnect() {
        //limit repeat the number and send close if limit is reached
        if (this.opts.repeatLimit !== null && this.opts.repeatLimit <= this.repeat) {
            this.close() //send close event immediately
            return;
        }
        if (this.lockReconnect) return true;
        if (this.forbidReconnect) {
            return false;
        }

        this.lockReconnect = true;
        this.repeat++;
        if (this.onreconnect) this.onreconnect();

        console.log(`WebSocket: reconnecting... ${this.repeat} of ${this.opts.repeatLimit}`);

        setTimeout(() => {
            this.createWebSocket();
            this.lockReconnect = false;
        }, this.opts.reconnectTimeout);
        return true;
    };
    send(msg) {
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(msg);
        }
    };
    pong(msg) {
        if (msg === this.opts.pongMsg) {
            let pongTime = new Date().getTime();
            let milliseconds = pongTime - this.pingTime;
            console.log(`WebSocket: pong - ${milliseconds} ms`);
        }
    }
    heartCheck() {
        this.heartReset();
        this.heartStart();
    };
    heartStart() {
        if (this.forbidReconnect) return;
        this.pingTimeoutId = setTimeout(() => {
            //onmessagesend ping message
            this.ws.send(this.opts.pingMsg);
            this.pingTime = new Date().getTime();

            this.pongTimeoutId = setTimeout(() => {
                console.log('WebSocket: pong timeout');
                //try to reconnect if no response.  
                this.reconnect();
            }, this.opts.pongTimeout);
        }, this.opts.pingTimeout);
    };
    heartReset() {
        clearTimeout(this.pingTimeoutId);
        clearTimeout(this.pongTimeoutId);
    };
    close(code) {
        //close websocket and prevent reconnect
        this.forbidReconnect = true;
        this.heartReset();
        this.ws.close(code);
    }
}