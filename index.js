"use strict";
const fs = require("fs");
const getPixels = require("get-pixels");
const savePixels = require("save-pixels");
const ndarray = require("ndarray");

function getPixelsFromPath(path) {
	return new Promise((resolve, reject) => {
		getPixels(path, function(err, pixels){
			if (err) {
				reject(`Reading image failed. ${err}`);
			}
			resolve(pixels);
		});
	});
}

function pixelCompare(args) {
	const basedImagePath = args.basedImage;
	const testImagePath = args.testImage;
	const outputImagePath = args.outputImage;
	const baseColor = args.baseColor || [255, 0, 0, 255];
	const testColor = args.testColor || [0, 255, 0, 255];

	const basedImageIsRealized = (
		basedImagePath.data !== undefined && 
		basedImagePath.shape !== undefined && 
		basedImagePath.stride !== undefined && 
		basedImagePath.offset !== undefined
	);
	const basedImagePromise = basedImageIsRealized ? Promise.resolve(basedImagePath) : getPixelsFromPath(basedImagePath);
	const testImagePromise = testImagePath ? getPixelsFromPath(testImagePath) : Promise.resolve();

	return Promise.all([
		basedImagePromise,
		testImagePromise
	])
	.then(([basedImageNdarray, testImageNdarray]) => {
		if (!testImageNdarray) {
			return function partiallyAppliedPixelCompare(newArgs) {
				return pixelCompare(Object.assign({}, args, newArgs, { basedImage: basedImageNdarray }));
			}
		}
		if (
			basedImageNdarray.shape[0] !== testImageNdarray.shape[0]
			|| basedImageNdarray.shape[1] !== testImageNdarray.shape[1]
		) {
			throw Error("image sizes are not the same");
		}

		if (basedImageNdarray.shape[2] !== testImageNdarray.shape[2]) {
			throw Error("image depths are not the same");
		}

		const width = basedImageNdarray.shape[0];
		const height = basedImageNdarray.shape[1];
		const resultArray = [];
		let isSame = true;
		for(let i = 0; i < width; ++i) {
			for(let j = 0; j < height; ++j) {
				const tr = testImageNdarray.get(j, i, 0);
				const tg = testImageNdarray.get(j, i, 1);
				const tb = testImageNdarray.get(j, i, 2);
				const ta = testImageNdarray.get(j, i, 3);

				const br = basedImageNdarray.get(j, i, 0);
				const bg = basedImageNdarray.get(j, i, 1);
				const bb = basedImageNdarray.get(j, i, 2);
				const ba = basedImageNdarray.get(j, i, 3);

				if (tr !== br || tg !== bg || tb !== bb || ta !== ba) {
					isSame = false;
					if (tr === 0 && tg === 0 && tb === 0 && ta === 0) {
						/*test image is empty, so set base image color*/
						resultArray.push(baseColor[0]);
						resultArray.push(baseColor[1]);
						resultArray.push(baseColor[2]);
						resultArray.push(baseColor[3]);
					}
					else if (br === 0 && bg === 0 && bb === 0 && ba === 0){
						/*base image is empty, so set test color*/
						resultArray.push(testColor[0]);
						resultArray.push(testColor[1]);
						resultArray.push(testColor[2]);
						resultArray.push(testColor[3]);
					}
					else {
						/*blend test and base color together*/
						const rr = baseColor[0] + testColor[0];
						const gg = baseColor[1] + testColor[1];
						const bb = baseColor[2] + testColor[2];
						resultArray.push(rr);
						resultArray.push(gg);
						resultArray.push(bb);
						resultArray.push(255);
					}
				}
				else {
					resultArray.push(br);
					resultArray.push(bg);
					resultArray.push(bb);
					resultArray.push(ba);
				}
			}
		}

		if (outputImagePath) {
			const outputImagePathLength = outputImagePath.length;
			const isJpeg = outputImagePath.indexOf(".jpeg") === (outputImagePathLength - 5);
			const isJpg = outputImagePath.indexOf(".jpg") === (outputImagePathLength - 4);
			const isPng = outputImagePath.indexOf(".png") === (outputImagePathLength - 4);
			if (!isJpeg && !isJpg && !isPng) {
				throw Error("Output image type is not supported");
			}
			const imageType = isJpeg ? "jpeg" : (isPng ? "png" : "jpg");
			const resultNdarray = ndarray(
				Uint8Array.from(resultArray),
				basedImageNdarray.shape,
				basedImageNdarray.stride,
				basedImageNdarray.offset
			);

			return new Promise((resolve, reject) => {
				const writable = fs.createWriteStream(outputImagePath);
				const stream = savePixels(resultNdarray, imageType).pipe(writable);
				stream.on("finish", () => {
					resolve(isSame);
				});
				stream.on("error", err => {
					reject(err);
				});
			});
		}
		else {
			return isSame;
		}
	});
}

module.exports = pixelCompare;