"use strict";

// #region //* Project-Base.js
const log = console.log;
const jsonType = "application/json";
const textType = "text/plain";
const OK = 200;

function sendEvent(name, data = 0) {
	return fetch("", {
		method: "POST",
		headers: { "Content-Type": jsonType },
		body: JSON.stringify({ name, data }),
	})
	.then(async res => {
		if (res.ok) {
			return res.headers.get("content-type") === jsonType ? res.json() : undefined;
		} else {
			throw new Error(await res.text());
		}
	})
	.catch(console.error);
} // sendEvent("log")
function writeFile(content, fileName, append = 0) {
	return sendEvent("write_file", { content, fileName, append });
} // writeFile("Test", "Test.txt")
function readFile(filename, fileType, redirect = false) {
	return fetch(redirect ? `/redirect?url=${encodeURIComponent(filename)}` : filename).then(resp => {
		if (resp.ok) {
			switch (
				fileType ?? (() => {
					try { return new URL(filename).pathname } // eslint-disable-line brace-style
					catch (err) { return filename }
				})().split(".").pop().toLowerCase()
			) {
				case "json":
					return resp.json();
				case "xml":
					return resp.text().then(frycAPI.parseXML);
				case "jpg":
				case "jpeg":
				case "png":
				case "gif":
				case "img":
				case "blob":
					return resp.blob();
				default:
					return resp.text();
			}
		} else {
			resp.text().then(txt => { throw new Error(txt) });
		}
	}); // .catch(err => console.error(err));
} // await readFile("url_or_filename");
function sum(...vals) {
	let suma = 0;
	const len = vals.length;
	for (let i = 0; i < len; i++) suma += vals[i];
	return suma;
}
function mean(...vals) {
	let suma = 0;
	const len = vals.length;
	for (let i = 0; i < len; i++) suma += vals[i];
	return suma / len;
}
function ctrlC(data) {
	return navigator.clipboard.writeText(data);
}
function ctrlV() {
	return navigator.clipboard.readText();
}
const abs   = Math.abs;
const floor = Math.floor;
const ceil  = Math.ceil;
const min   = Math.min;
const max   = Math.max;
const isNan = Number.isNaN;
// #endregion

(async function main() {
	const openGate = document.getElementById("openGate");
	openGate.addEventListener("click", event => {
		openGate.setAttribute("disabled", "true");
		fetch("/openGate", {
			headers: {
				fetch: "1",
			},
		})
		.then(res => res.text())
		.then(txt => {
			log(txt);
			openGate.removeAttribute("disabled");
		});
	});
})();

// http://192.168.0.167:3090/
// http://192.168.194.151:3090/

// http://192.168.0.167:3090/openGate
// http://192.168.194.151:3090/openGate
