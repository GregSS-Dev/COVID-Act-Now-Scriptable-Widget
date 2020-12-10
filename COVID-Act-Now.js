"use strict";

/**
 * This widget is from <https://github.com/GregSS-Dev/COVID-Act-Now-Scriptable-Widget>
 * By Greg Scherrer
 * Based on PurpleAir-AQI-Scriptable-Widget,
 *   code by Jason Snell, Rob Silverii, Adam Lickel, 
 *   Alexander Ogilvie, Brian Donovan, and Matt Silverlock:
 *   <https://github.com/jasonsnell/PurpleAir-AQI-Scriptable-Widget>
 */
 
/**
 * This product uses the FCC Data API but is not endorsed or certified by the FCC
 *
 * API is used to determine the county FIPS code for the current location.
 */
 
const FIPS_API_URL = "https://geo.fcc.gov/api";

/**
 * COVID data obtained using the COVID Act Now API (covidactnow.org):
 *
 * Covid Act Now is a 501(c)(3) nonprofit founded in March 2020. 
 *   It strives to provide the most timely and accurate local COVID 
 *   data so that every American can make informed decisions during 
 *   the pandemic.
 */
const COVID_API_URL = "https://api.covidactnow.org/v2";
const COVID_API_KEY = "1c7d2318e52f433ca373217b6949478c";

/**
 * Retrieve county-level data by 5-digit FIPS county code
 * @type {number}
 */
const FIPS_CODE = args.widgetParameter; 

/**
 * Comparison results
 */
const ORDERED_ASCENDING = -1;
const ORDERED_SAME = 0;
const ORDERED_DESCENDING = 1;
const ORDERED_UNDEFINED = -100;

/**
 * Widget attributes: AQI level threshold, text label, gradient start and end colors, text color
 *
 * @typedef {object} LevelAttribute
 * @property {number} threshold
 * @property {string} label
 * @property {string} startColor
 * @property {string} endColor
 * @property {string} textColor
 * @property {string} darkStartColor
 * @property {string} darkEndColor
 * @property {string} darkTextColor
 */

/**
 * @typedef {object} SensorData
 * @property {string} val
 * @property {string} adj1
 * @property {string} adj2
 * @property {number} ts
 * @property {string} hum
 * @property {string} loc
 * @property {string} lat
 * @property {string} lon
 */

/**
 * @typedef {object} LatLon
 * @property {number} latitude
 * @property {number} longitude
 */

/**
 * Get JSON from a local file
 *
 * @param {string} fileName
 * @returns {object}
 */
function getCachedData(fileName) {
	const fileManager = FileManager.local();
	const cacheDirectory = fileManager.joinPath(fileManager.libraryDirectory(), "covid-act-now");
	const cacheFile = fileManager.joinPath(cacheDirectory, fileName);

	if (!fileManager.fileExists(cacheFile)) {
		return undefined;
	}

	const contents = fileManager.readString(cacheFile);
	return JSON.parse(contents);
}

/**
 * Write JSON to a local file
 *
 * @param {string} fileName
 * @param {object} data
 */
function cacheData(fileName, data) {
	const fileManager = FileManager.local();
	const cacheDirectory = fileManager.joinPath(fileManager.libraryDirectory(), "covid-act-now");
	const cacheFile = fileManager.joinPath(cacheDirectory, fileName);

	if (!fileManager.fileExists(cacheDirectory)) {
		fileManager.createDirectory(cacheDirectory);
	}

	const contents = JSON.stringify(data);
	fileManager.writeString(cacheFile, contents);
}

/**
 * Gets the FIPS code for the current location
 *
 * @returns {Promise<number>}
 */
 
async function getFipsCode() {
	if (FIPS_CODE) return FIPS_CODE;

	let fallbackFipsCode = undefined;

	try {
		const cachedFipsCode = getCachedData("fips-code.json");
		if (cachedFipsCode) {
			console.log({ cachedFipsCode });

			const { id, updatedAt } = cachedFipsCode;
			fallbackFipsCode = id;
			// If we've fetched the location within the last 15 minutes, just return it
			if (Date.now() - updatedAt < 15 * 60 * 1000) {
				return id;
			}
		}

		/** @type {LatLon} */
		// We don't need precise location
		Location.setAccuracyToKilometer();
		const { latitude, longitude } = await Location.current();
		
		const req = new Request(
			`${FIPS_API_URL}/census/area?lat=${latitude}&lon=${longitude}&format=json`
		);

		/** @type {{ input?: Array<Object<string, number>>;; results?: Array<Object<string, number|string>>; }} */
		const res = await req.loadJSON();

		const countyFips = "county_fips";

		const id = res["results"][0][countyFips];
		cacheData("fips-code.json", { id, updatedAt: Date.now() });

		return id;
	} catch (error) {
		console.log(`Could not fetch FIPS code: ${error}`);
		return fallbackFipsCode;
	}
}

/**
 * Compare two numeric values
 * 
 * @param {number} a
 * @param {number} b
 * @returns {number}:
 *   -1 if a < b
 *    0 if a = b
 *   +1 if a > b
 */

function compareValues(a,b) {
	if (a && b) {
		if (a == b) {
			return ORDERED_SAME;
		} else if (a > b) {
			return ORDERED_DESCENDING;
		} else if (a < b) {
			return ORDERED_ASCENDING;
		}
	} else {
		return ORDERED_UNDEFINED
	};
}
 
/**
 * Fetch content from COVID Act Now
 *
 * @param {number} fipsCode
 * @returns {Promise<CovidData>}
 */
async function getCovidData(fipsCode) {
	const fipsCache = `fips-${fipsCode}-historical-data.json`;
	const req = new Request(`${COVID_API_URL}/county/${fipsCode}.timeseries.json?apiKey=${COVID_API_KEY}`);
	let json = await req.loadJSON();

	try {
		// Check that our results are what we expect
		if (json && json.fips && json.riskLevels && json.riskLevels.overall && json.fips && json.county && json.state && json.lastUpdatedDate && json.metrics && json.metrics.caseDensity && json.metricsTimeseries && json.url) {
			console.log(`COVID historical data looks good, will cache.`);
			const covidData = { json, updatedAt: Date.now() }
			cacheData(fipsCache, covidData);
		} else {
			const { json: cachedJson, updatedAt } = getCachedData(fipsCache);
			if (Date.now() - updatedAt > 2 * 60 * 60 * 1000) {
				// Bail if our data is > 2 hours old
				throw `Our cache is too old: ${updatedAt}`;
			}
			console.log(`Using cached COVID historical data: ${updatedAt}`);
			json = cachedJson;
		}

		let mTestPositivityRatioChangeIndicator = ORDERED_UNDEFINED;
		let mCaseDensityChangeIndicator = ORDERED_UNDEFINED;
		let mContactTracerCapacityRatioChangeIndicator = ORDERED_UNDEFINED;
		let mInfectionRateChangeIndicator = ORDERED_UNDEFINED;
		let mIcuHeadroomRatioChangeIndicator = ORDERED_UNDEFINED;
		if (json.metricsTimeseries.length > 1) {
			mTestPositivityRatioChangeIndicator =  compareValues(json.metricsTimeseries[json.metricsTimeseries.length - 2].testPositivityRatio,json.metrics.testPositivityRatio);
			mCaseDensityChangeIndicator = compareValues(json.metricsTimeseries[json.metricsTimeseries.length - 2].caseDensity,json.metrics.caseDensity);
			mContactTracerCapacityRatioChangeIndicator = compareValues(json.metricsTimeseries[json.metricsTimeseries.length - 2].contactTracerCapacity,json.metrics.contactTracerCapacity);
			mInfectionRateChangeIndicator = compareValues(json.metricsTimeseries[json.metricsTimeseries.length - 2].infectionRate,json.metrics.infectionRate);
			mIcuHeadroomRatioChangeIndicator = compareValues(json.metricsTimeseries[json.metricsTimeseries.length - 2].icuHeadroomRatio,json.metrics.icuHeadroomRatio);
		}
		return {
			fips: json.fips,
			county: json.county,
			state: json.state,
			lastUpdatedDate: json.lastUpdatedDate,
			rlOverall: json.riskLevels.overall,
			rlTestPositivityRatio: json.riskLevels.testPositivityRatio,
			rlCaseDensity: json.riskLevels.caseDensity,
			rlcontactTracerCapacityRatio: json.riskLevels.contactTracerCapacityRatio,
			rlIcuHeadroomRatio: json.riskLevels.icuHeadroomRatio,
			mTestPositivityRatio: json.metrics.testPositivityRatio,
			mCaseDensity: json.metrics.caseDensity,
			mContactTracerCapacityRatio: json.metrics.contactTracerCapacityRatio,
			mInfectionRate: json.metrics.infectionRate,
			mIcuHeadroomRatio: json.metrics.icuHeadroomRatio,
			mTestPositivityRatioChangeIndicator: mTestPositivityRatioChangeIndicator,
			mCaseDensityChangeIndicator: mCaseDensityChangeIndicator,
			mContactTracerCapacityRatioChangeIndicator: mContactTracerCapacityRatioChangeIndicator,
			mInfectionRateChangeIndicator: mInfectionRateChangeIndicator,
			mIcuHeadroomRatioChangeIndicator: mIcuHeadroomRatioChangeIndicator,
			url: json.url,
	};
	} catch (error) {
		console.log(`Could not parse JSON: ${error}`);
		throw 666;
	}
}

/** @type {Array<LevelAttribute>} sorted by threshold desc. */
const RISK_LEVEL_ATTRIBUTES = [
	{
		label: "Low",
		description: "On track to contain COVID",
		startColor: "00d474",
		endColor: "00ad5e",
		textColor: "f0f0f0",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "00d474",
		symbol: "checkmark.circle.fill",
	},
	{
		label: "Medium",
		description: "Slow disease growth",
		startColor: "ffc900",
		endColor: "d8aa00",
		textColor: "0f0f0f",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "ffc900",
		symbol: "exclamationmark.circle.fill",
	},
	{
		label: "High",
		description: "At risk of outbreak",
		startColor: "ff9600",
		endColor: "d87f00",
		textColor: "f0f0f0",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "ff9600",
		symbol: "exclamationmark.triangle.fill",
	},
	{
		label: "Critical",
		description: "Active or imminent outbreak",
		startColor: "d9002c",
		endColor: "d9002c",
		textColor: "f0f0f0",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "d9002c",
		symbol: "exclamationmark.octagon.fill",
	},
	{
		label: "Unknown",
		description: "Risk unknown",
		startColor: "cccccc",
		endColor: "a5a5a5",
		textColor: "0f0f0f",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "cccccc",
		symbol: "questionmark.circle.fill",
	},
	{
		label: "Extreme",
		description: "Severe outbreak",
		startColor: "790019",
		endColor: "790019",
		textColor: "f0f0f0",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "d8002c",
		symbol: "bolt.circle.fill",
	},
];

/**
 * Calculates the AQI level
 * based on https://cfpub.epa.gov/airnow/index.cfm?action=aqibasics.aqi#unh
 *
 * @param {number|'-'} aqi
 * @returns {LevelAttribute & { level: number }}
 */
 
function calculateLevel(rl) {
	const level = Number(rl) || 0;

	return {
		label: RISK_LEVEL_ATTRIBUTES[level].label,
		description: RISK_LEVEL_ATTRIBUTES[level].description,
		startColor: RISK_LEVEL_ATTRIBUTES[level].startColor,
		endColor: RISK_LEVEL_ATTRIBUTES[level].endColor,
		textColor: RISK_LEVEL_ATTRIBUTES[level].textColor,
		darkStartColor: RISK_LEVEL_ATTRIBUTES[level].darkStartColor,
		darkEndColor: RISK_LEVEL_ATTRIBUTES[level].darkEndColor,
		darkTextColor: RISK_LEVEL_ATTRIBUTES[level].darkTextColor,
		symbol: RISK_LEVEL_ATTRIBUTES[level].symbol,
	};
}

/**
 * Provides an SFSymbol name for a given comparison result, or null if none 
 * should be displayed
 *
 * @param {number} comparison
 * @returns {string}
 */
 
function changeSymbolNameForComparison(comparison) {
	if (comparison == ORDERED_ASCENDING) {
		return "arrow.up";
	} else if (comparison == ORDERED_DESCENDING) {
		return "arrow.down";
	} else {
		return null;
	}
}
 
/**
 * Constructs an SFSymbol from the given symbolName
 *
 * @param {string} symbolName
 * @returns {object} SFSymbol
 */
function createSymbol(symbolName) {
	const symbol = SFSymbol.named(symbolName);
	symbol.applyFont(Font.systemFont(15));
	return symbol;
}

async function run() {
	const listWidget = new ListWidget();
	listWidget.setPadding(10, 15, 10, 10);

	try {
		 const fipsCode = await getFipsCode();

		if (!fipsCode) {
			throw "Please specify a 5-digit FIPS code for this widget to load county-level data.";
		}
		console.log(`Using FIPS code: ${fipsCode}`);

		const data = await getCovidData(fipsCode);

		const county = `${data.county}`;
		console.log({ county });

		const state = `${data.state}`;
		console.log({ state });

		const rlOverall = data.rlOverall;
		console.log({ rlOverall });

		const url = `${data.url}`;
		console.log({ url });

		const level = calculateLevel(rlOverall);

		const mCaseDensity = data.mCaseDensity.toFixed(1);
		console.log({ mCaseDensity });
		
		const mCaseDensityChangeIndicator = data.mCaseDensityChangeIndicator;
		console.log({ mCaseDensityChangeIndicator });

		const startColor = Color.dynamic(new Color(level.startColor), new Color(level.darkStartColor));
					
		const endColor = Color.dynamic(new Color(level.endColor), new Color(level.darkEndColor));
		
		const textColor = Color.dynamic(new Color(level.textColor), new Color(level.darkTextColor));
		
		const gradient = new LinearGradient();

		gradient.colors = [startColor, endColor];
		gradient.locations = [0.0, 1];
		console.log({ gradient });

		listWidget.backgroundGradient = gradient;

		const header = listWidget.addText('COVID Risk Level'.toUpperCase());
		header.textColor = textColor;
		header.font = Font.regularSystemFont(11);
		header.minimumScaleFactor = 0.50;

		const wordLevel = listWidget.addText(level.label);
		wordLevel.textColor = textColor;
		wordLevel.font = Font.semiboldSystemFont(25);
		wordLevel.minimumScaleFactor = 0.3;

		listWidget.addSpacer(5);

		const scoreStack = listWidget.addStack();
		const content = scoreStack.addText(mCaseDensity);
		content.textColor = textColor;
		content.font = Font.semiboldSystemFont(30);
		const riskSymbol = createSymbol(level.symbol);
		const riskImg = scoreStack.addImage(riskSymbol.image);
		riskImg.resizable = false;
		riskImg.tintColor = textColor;
		riskImg.imageSize = new Size(30, 36);
		const trendSymbolName = changeSymbolNameForComparison(mCaseDensityChangeIndicator);
		if (trendSymbolName) {
			const trendSymbol = createSymbol(trendSymbolName);
			const trendImg = scoreStack.addImage(trendSymbol.image);
			trendImg.resizable = false;
			trendImg.tintColor = textColor;
			trendImg.imageSize = new Size(30, 36);
		}
		
		const caseDensityLabel = listWidget.addText('New Cases per 100K'.toUpperCase());
		caseDensityLabel.textColor = textColor;
		caseDensityLabel.font = Font.regularSystemFont(9);
		caseDensityLabel.minimumScaleFactor = 0.6;

		listWidget.addSpacer(10);

		const locationText = listWidget.addText(county + ", " + state);
		locationText.textColor = textColor;
		locationText.font = Font.regularSystemFont(14);
		locationText.minimumScaleFactor = 0.5;

		listWidget.addSpacer(2);

		const updatedDate = new Date(data.lastUpdatedDate).toLocaleDateString();
		const widgetText = listWidget.addText(`Updated ${updatedDate}`);
		widgetText.textColor = textColor;
		widgetText.font = Font.regularSystemFont(9);
		widgetText.minimumScaleFactor = 0.6;

		var refreshDate = new Date();
		refreshDate.setHours( refreshDate.getHours() + 4 );
		listWidget.refreshAfterDate = refreshDate;
		
		listWidget.url = url;
	} catch (error) {
		if (error === 666) {
			// Handle JSON parsing errors with a custom error layout

			listWidget.background = new Color('999999');
			const header = listWidget.addText('Error'.toUpperCase());
			header.textColor = new Color('000000');
			header.font = Font.regularSystemFont(11);
			header.minimumScaleFactor = 0.50;

			listWidget.addSpacer(15);

			const wordLevel = listWidget.addText(`Couldn't connect to the server.`);
			wordLevel.textColor = new Color ('000000');
			wordLevel.font = Font.semiboldSystemFont(15);
			wordLevel.minimumScaleFactor = 0.3;
		} else {
			console.log(`Could not render widget: ${error}`);

			const errorWidgetText = listWidget.addText(`${error}`);
			errorWidgetText.textColor = Color.red();
			errorWidgetText.textOpacity = 30;
			errorWidgetText.font = Font.regularSystemFont(10);
		}
	}

	if (config.runsInApp) {
		listWidget.presentSmall();
	}

	Script.setWidget(listWidget);
	Script.complete();
}

await run();