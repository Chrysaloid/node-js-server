"use strict";

// #region //* Project-Base.js
const log = console.log;
// let main = () => {}; // eslint-disable-line prefer-const
// window.addEventListener("load", () => {
// 	if (typeof frycAPI === "undefined") {
// 		const myAPI = document.createElement("script");
// 		myAPI.setAttribute("type", "text/javascript");
// 		myAPI.addEventListener("load", main);
// 		// https://github.com/Chrysaloid/JS-plus-CSS-Injector/blob/main/frycAPI.js?raw=true
// 		// https://raw.githubusercontent.com/Chrysaloid/JS-plus-CSS-Injector/main/frycAPI.js
// 		myAPI.setAttribute("src", "https://cdn.jsdelivr.net/gh/Chrysaloid/JS-plus-CSS-Injector@main/frycAPI.js");
// 		document.head.appendChild(myAPI);
// 	} else {
// 		main();
// 	}
// });
function writeFile(content, fileName, append = 0) {
	fetch("/writeFile", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ content, fileName, append }),
	})
	.then(async resp => {
		if (resp.ok) {
			return resp.text();
		} else {
			throw new Error(await resp.text());
		}
	})
	.then(log)
	.catch(console.error);
}
function readFile(fileName, fileType, redirect) {
	return frycAPI.readFile(fileName, fileType, redirect);
}
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

// main = async () => {
// };
// #endregion


