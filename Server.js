"use strict";

console.clear();
const log = console.log;
Object.defineProperty(Object.prototype, "lóg", {
	get() {
		log(this.valueOf());
		return this;
	},
});

const http = require("node:http");
const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const mime = require("mime").default;
const path = require("node:path");
const { exec } = require("node:child_process");
const { json, text } = require("node:stream/consumers");
const moment = require("moment");
const os = require("node:os");

function currentTime() {
	return moment().format("YYYY-MM-DD HH:mm:ss.SSS");
}
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms)); // eslint-disable-line no-promise-executor-return
}

let myAdress;
const currDir = __dirname;
process.chdir(currDir);
const mainHTML = "site.html";
function respond(res, statusCode, data, type = "text/plain") {
	res.writeHead(statusCode, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" });
	if (statusCode === 200) {
		res.end(data);
	} else {
		res.end(statusCode + " " + http.STATUS_CODES[statusCode] + (data !== undefined ? ". " + data : ""));
	}
}

const server = http.createServer(async (req, res) => {
	if (req.method === "OPTIONS") {
		respond(res, 200, "");
		return;
	}

	const reqURL = new URL(req.url, myAdress);
	const pathname = decodeURI(reqURL.pathname);
	log(`${currentTime()} - ${pathname}`);
	if (pathname === "/ping") {
		respond(res, 200, "pong"); // OK
	} else if (req.method === "POST" && pathname === "/writeFile") {
		try {
			const queryObject = await json(req);

			const content = queryObject.content || "";
			const fileName = queryObject.fileName || "output.txt";
			const writeFun = queryObject.append ? fs.appendFile : fs.writeFile;
			log(`Wrote to file "${fileName}"`);

			const filePath = path.join(currDir, fileName);
			writeFun(filePath, content, "utf8", err => {
				if (err) return respond(res, 500, "Error writing to file"); // Internal Server Error
				respond(res, 200, `Successfully wrote to ${fileName}`); // OK
			});
		} catch (err) {
			respond(res, 400, "Invalid JSON data"); // Bad Request
		}
	} else if (pathname === "/redirect") {
		try {
			const url = reqURL.searchParams.get("url");
			fetch(url).then(response => response.arrayBuffer()).then(data => respond(res, 200, Buffer.from(data)));
		} catch (err) {
			log(err);
			respond(res, 500); // Internal Server Error
		}
	} else {
		const filePath = path.join(currDir, pathname === "/" ? mainHTML : pathname);
		fs.stat(filePath, (err, stats) => {
			if (err) {
				if (err.code === "ENOENT") {
					respond(res, 404); // Not Found
				} else if (err.code === "EACCES" || err.code === "EPERM") {
					respond(res, 403); // Permission denied
				} else {
					respond(res, 500); // Internal Server Error
				}
				return;
			}

			const ifModifiedSince = req.headers["if-modified-since"];

			if (ifModifiedSince && new Date(ifModifiedSince).getTime() >= stats.mtime.setMilliseconds(0)) {
				res.writeHead(304); // Not Modified
				res.end();
				return;
			}

			res.writeHead(200, {
				"Content-Type": mime.getType(path.extname(filePath)) || "application/octet-stream",
				"Last-Modified": stats.mtime.toUTCString(),
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers": "*",
				"Cache-Control": "public, max-age=0, must-revalidate",
			});

			// Stream the file directly to the response
			fs.createReadStream(filePath).pipe(res);
		});
	}
});
function getLocalNetworkObject() {
	for (const interArr of Object.values(os.networkInterfaces())) {
		for (const iface of interArr) {
			if (iface.family === "IPv4" && !iface.internal && iface.address.startsWith("192.168.")) {
				return iface;
			}
		}
	}
	return "localhost"; // fallback
}
server.listen(3090, async err => { // default address: http://localhost:3090/
	if (err) return console.error(err);

	myAdress = `http://${getLocalNetworkObject().address}:${server.address().port}/`;

	log(`Server running at ${myAdress}`);
	log(`Base directory: ${currDir}`);
});
