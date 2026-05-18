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
const { exec, spawn } = require("node:child_process");
const { json, text } = require("node:stream/consumers");
const moment = require("moment");
const os = require("node:os");
const chalk = require("chalk").default;

const jsonType = "application/json";
const textType = "text/plain";
const OK = 200;
const TOKEN = require("./token.json");
const USB_DEVICE = "/dev/bus/usb/001/012";
const USB_SWITCH_BINARY = "./usb-switch";

function currentTime() {
	return moment().format("YYYY-MM-DD HH:mm:ss.SSS");
}
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms)); // eslint-disable-line no-promise-executor-return
}
function sanitizeFilename(filename = "") {
	return filename.replaceAll(/^\/?(\.\.\/)+|\.?\//g, "");
}

/* // Może kiedyś
exec("termux-usb -l", (error, stdout, stderr) => {
	if (error) {
		console.error(`exec error: ${error}`);
		return;
	}
	if (stderr.trim()) {
		console.error(`stderr: ${stderr}`);
		return;
	}
	const usbDeviceArray = JSON.parse(stdout);
	if (usbDeviceArray.length < 2) return;
});
*/

let switchProcess = null;
if (false) {
	switchProcess = spawn(
		"termux-usb",
		["-e", USB_SWITCH_BINARY, USB_DEVICE],
		{
			env: { ...process.env, SWITCH: "READ", QUIET: "1" },
			stdio: ["pipe", "inherit", "inherit"],
		}
	);
	switchProcess.on("error", err => {
		log(chalk.red(`${USB_SWITCH_BINARY} returned error:`), err);
		switchProcess = null;
	});
	switchProcess.once("close", (code, signal) => {
		if (signal) {
			log(`${USB_SWITCH_BINARY} was killed by signal ${signal}`);
		} else if (code === 0) {
			log(`${USB_SWITCH_BINARY} completed successfully`);
		} else {
			log(chalk.red(`${USB_SWITCH_BINARY} failed with code ${code}`));
		}
		switchProcess = null;
	});
	// Give the CH340 init time to complete
	sleep(1200).then(() => { switchProcess.ready = true });
}

async function sendCommand(proc, command) {
	if (!proc) return;
	return new Promise((resolve, reject) => {
		proc.stdin.write(command, err => {
			if (err) reject(err);
			else resolve();
		});
	});
}
function switchOn()  { return sendCommand(switchProcess, "1") }
function switchOff() { return sendCommand(switchProcess, "0") }

let myAdress;
const currDir = __dirname;
const websiteFiles = new Set([
	"script.js",
	"style.css",
	"site.html",
	"http.png",
]);
process.chdir(currDir);
const mainHTML = "site.html";
function simpleResponder(req, res, statusCode = OK, data, type = textType) {
	res.writeHead(statusCode, {
		"Content-Type": statusCode === OK ? type : (req.headers.fetch === "1" ? textType : "text/html"),
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "*",
	});
	if (statusCode === OK) {
		res.end(data);
	} else if (req.headers.fetch === "1") {
		res.end(statusCode + ": " + http.STATUS_CODES[statusCode] + (data ? ". " + data : ""));
	} else {
		const statusCodeText = http.STATUS_CODES[statusCode];
		res.end(/*html*/`<!DOCTYPE html>
			<html>
				<head>
					<meta name="color-scheme" content="dark light"/>
					<link rel="icon" href="data:image/png;base64,iVBORw0KGgo=">
					<title>${statusCodeText}</title>
				</head>
				<body style="font-family: 'IBM Plex Sans Condensed', Arial, sans-serif;">
					<h1 style="text-align: center;">${statusCode} - ${statusCodeText}${(data !== undefined ? ". " + data : "")}</h1>
				</body>
			</html>
		`); // .replaceAll(/^\s+|[\t\f ]+$|\n/gm, "") // this might not be faster on a mobile device
	}
}

const WEBSITE_FOLDER = "website";
const server = http.createServer(async (req, res) => {
	const respond = (statusCode, data, type) => simpleResponder(req, res, statusCode, data, type);
	if (req.method === "OPTIONS") {
		respond();
		return;
	}

	const reqURL = new URL(req.url, myAdress);
	const pathname = decodeURI(reqURL.pathname);
	log(`${currentTime()} - ${pathname}`);
	if (pathname === "/ping") {
		respond();
	} else if (req.method === "POST") {
		let reqJson;
		try {
			reqJson = await json(req);
		} catch (err) {
			respond(400, "Invalid JSON data"); // Bad Request
			return;
		}

		const { name, data } = reqJson;
		switch (name) {
			case "write_file": {
				const filename = sanitizeFilename(data.fileName || "output.txt");
				if (websiteFiles.has(filename)) return respond(403); // Permission denied
				const content = data.content || "";
				const writeFun = data.append ? fs.appendFile : fs.writeFile;
				log(`Wrote to file "${filename}"`);

				const filePath = path.join(currDir, WEBSITE_FOLDER, filename);
				writeFun(filePath, content, "utf8", err => {
					if (err) return respond(500, "Error writing to file"); // Internal Server Error
					respond();
				});
				break;
			}
			case "log": {
				log(data);
				respond();
				break;
			}
			default: {
				const txt = `There is no event of name "${name}"`;
				log(chalk.red(`${txt}. Received data:`), data);
				respond(400, txt); // Bad Request
				break;
			}
		}
	} else if (pathname === "/redirect") {
		try {
			const url = reqURL.searchParams.get("url");
			fetch(url).then(response => response.arrayBuffer()).then(data => respond(OK, Buffer.from(data)));
		} catch (err) {
			log(err);
			respond(500); // Internal Server Error
		}
	} else if (pathname === "/openGate") {
		if (!switchProcess || switchProcess.exitCode) return respond(500, "Switch process is not running"); // Internal Server Error
		if (!switchProcess.ready) return respond(503, "Switch process is not ready"); // Service Unavailable
		try {
			await switchOn();
			await sleep(1000);
			await switchOff();
		} catch (err) {
			respond(500, err.message); // Internal Server Error
			return;
		}
		if (switchProcess) {
			respond(OK, "OK");
		} else {
			respond(500, "Switch process failed"); // Internal Server Error
		}
	} else {
		const filePath = path.join(currDir, WEBSITE_FOLDER, pathname === "/" ? mainHTML : sanitizeFilename(pathname));
		fs.stat(filePath, (err, stats) => {
			if (err) {
				if (err.code === "ENOENT") {
					respond(404); // Not Found
				} else if (err.code === "EACCES" || err.code === "EPERM") {
					respond(403); // Permission denied
				} else {
					respond(500); // Internal Server Error
				}
				return;
			}

			const ifModifiedSince = req.headers["if-modified-since"];

			if (ifModifiedSince && new Date(ifModifiedSince).getTime() >= stats.mtime.setMilliseconds(0)) {
				res.writeHead(304); // Not Modified
				res.end();
				return;
			}

			res.writeHead(OK, {
				"Content-Type": mime.getType(path.extname(filePath)) || "application/octet-stream",
				"Last-Modified": stats.mtime.toUTCString(),
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Headers": "*",
				"Cache-Control": "public, max-age=0, must-revalidate",
				"Content-Length": stats.size,
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
server.listen(3090, async err => {
	if (err) return console.error(err);

	const myPort = server.address().port;
	myAdress = `http://${getLocalNetworkObject().address}:${myPort}/`;

	log(`Server running at ${
		Object.values(os.networkInterfaces())
		.map(interArr => {
			return interArr.filter(iface => {
				return iface.family === "IPv4" && !iface.internal && iface.address.startsWith("192.168.");
			}).map(iface => `http://${iface.address}:${myPort}/`)
			.join(" and ");
		}).filter(s => s).join(" and ")} | Base directory: ${currDir}/${WEBSITE_FOLDER}`
	);
});

// tail -n +1 -f ~/node-js-server/server.log
// http://192.168.0.167:3090/
