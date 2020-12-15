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
			url: json.url,
			lastUpdatedDate: json.lastUpdatedDate,
			rlOverall: json.riskLevels.overall,
			testPositivityRatio: {
				riskLevel: json.riskLevels.testPositivityRatio,
				metric: json.metrics.testPositivityRatio,
				changeIndicator: mTestPositivityRatioChangeIndicator,
				label: "Positive Test Rate",
				precision: 1,
				displaysAsPercent: true
			},
			caseDensity: {
				riskLevel: json.riskLevels.caseDensity,
				metric: json.metrics.caseDensity,
				changeIndicator: mCaseDensityChangeIndicator,
				label: "Daily New Cases/100K",
				precision: 1,
				displaysAsPercent: false
			},
			contactTracerCapacityRatio: {
				riskLevel: json.riskLevels.contactTracerCapacityRatio,
				metric: json.metrics.contactTracerCapacityRatio,
				changeIndicator: mContactTracerCapacityRatioChangeIndicator,
				label: "Tracers Hired",
				precision: 0,
				displaysAsPercent: true
			},
			icuHeadroomRatio: {
				riskLevel: json.riskLevels.icuHeadroomRatio,
				metric: json.metrics.icuHeadroomRatio,
				changeIndicator: mIcuHeadroomRatioChangeIndicator,
				label: "ICU Headroom Used",
				precision: 0,
				displaysAsPercent: true
			},
			infectionRate: {
				riskLevel: json.riskLevels.infectionRate,
				metric: json.metrics.infectionRate,
				changeIndicator: mInfectionRateChangeIndicator,
				label: "Infection Rate",
				precision: 2,
				displaysAsPercent: false
			}
		};
	} catch (error) {
		console.log(`Could not parse JSON: ${error}`);
		throw 666;
	}
}

/** @type {Array<ColorAttribute>} sorted light to dark. */
const LIGHT = 0;
const DARK = 1;
const BACKGROUND_COLORS = [
	{
		startColor: "ffffff",
		endColor: "d7d7d7",
		textColor: "0c0c0c",
		labelTextColor: "aaaaaa"
	},
	{
		startColor: "333333",
		endColor: "000000",
		textColor: "cccccc",
		labelTextColor: "333333"
	}
];
/** @type {Array<LevelAttribute>} sorted by risk level. */
const RISK_LEVEL_ATTRIBUTES = [
	{
		label: "Low",
		description: "On track to contain COVID",
		indicatorColor: "00d474",
		startColor: "00d474",
		endColor: "00ad5e",
		textColor: "f0f0f0",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "00d474",
		symbol: "checkmark.circle.fill"
	},
	{
		label: "Medium",
		description: "Slow disease growth",
		indicatorColor: "ffc900",
		startColor: "ffc900",
		endColor: "d8aa00",
		textColor: "0f0f0f",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "ffc900",
		symbol: "exclamationmark.circle.fill"
	},
	{
		label: "High",
		description: "At risk of outbreak",
		indicatorColor: "ff9600",
		startColor: "ff9600",
		endColor: "d87f00",
		textColor: "f0f0f0",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "ff9600",
		symbol: "exclamationmark.triangle.fill"
	},
	{
		label: "Critical",
		description: "Active or imminent outbreak",
		indicatorColor: "d9002c",
		startColor: "d9002c",
		endColor: "d9002c",
		textColor: "f0f0f0",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "d9002c",
		symbol: "exclamationmark.octagon.fill"
	},
	{
		label: "Unknown",
		description: "Risk unknown",
		indicatorColor: "cccccc",
		startColor: "cccccc",
		endColor: "a5a5a5",
		textColor: "0f0f0f",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "cccccc",
		symbol: "questionmark.circle.fill"
	},
	{
		label: "Extreme",
		description: "Severe outbreak",
		indicatorColor: "790019",
		startColor: "790019",
		endColor: "790019",
		textColor: "f0f0f0",
		darkStartColor: "333333",
		darkEndColor: "000000",
		darkTextColor: "d8002c",
		symbol: "bolt.circle.fill"
	}
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
		indicatorColor: RISK_LEVEL_ATTRIBUTES[level].indicatorColor,
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

/**
 * Constructs a stack with metric data for display in the widget
 *
 * @param {WidgetStack} metricStack
 * @param {{Number} riskLevel, {Number} metric, {enum} changeIndicator}
 * @param {Color} textColor
 */
function displayMetricStack(metricStack, metricData, textColor) {
	console.log(metricData);
	
	const METRIC_TEXT_SIZE = 18;
	const METRIC_MIN_SCALE = 1.0;
	const METRIC_LINE_LIMIT = 1;
	const METRIC_CHANGE_INDICATOR_SIZE = 24;
	const METRIC_LABEL_TEXT_SIZE = 10;
	const METRIC_LABEL_MIN_SCALE = 0.6;
	const METRIC_LABEL_LINE_LIMIT = 1;
	
	metricStack.layoutVertically();
	metricStack.centerAlignContent();

	const metricLabelStack = metricStack.addStack();
	metricLabelStack.addSpacer(null);
	const labelText = metricLabelStack.addText(metricData.label.toUpperCase());
	labelText.centerAlignText();
	labelText.lineLimit = METRIC_LINE_LIMIT;
	labelText.textColor = textColor;
	labelText.centerAlignText();
	labelText.font = Font.regularSystemFont(METRIC_LABEL_TEXT_SIZE);
	labelText.minimumScaleFactor = METRIC_LABEL_MIN_SCALE;
	metricLabelStack.addSpacer(null);

	const scoreStack = metricStack.addStack();
	scoreStack.centerAlignContent();
	
	scoreStack.addSpacer(null);

	const level = calculateLevel(metricData.riskLevel);
	const riskSymbol = createSymbol(level.symbol);
	const riskImg = scoreStack.addImage(riskSymbol.image);

	riskImg.centerAlignImage();
	riskImg.resizable = false;
	riskImg.tintColor = Color.dynamic(new Color(level.indicatorColor), new Color(level.darkTextColor));
	riskImg.imageSize = new Size(30, 36);
	
	const metricNumber = new Number(((metricData.displaysAsPercent?100:1) * metricData.metric));
	const content = scoreStack.addText(metricNumber.toFixed(metricData.precision) + (metricData.displaysAsPercent?"%":""));
	content.lineLimit = METRIC_LABEL_LINE_LIMIT;
	content.textColor = metricData.textColor;
	content.font = Font.semiboldSystemFont(METRIC_TEXT_SIZE);
	content.minimumScaleFactor = METRIC_MIN_SCALE;
	const trendSymbolName = changeSymbolNameForComparison(metricData.changeIndicator);
	if (trendSymbolName) {
		const trendSymbol = createSymbol(trendSymbolName);
		const trendImg = scoreStack.addImage(trendSymbol.image);
		trendImg.resizable = false;
		trendImg.tintColor = textColor;
		trendImg.imageSize = new Size(0.8 * METRIC_CHANGE_INDICATOR_SIZE, METRIC_CHANGE_INDICATOR_SIZE);
	}
	
	scoreStack.addSpacer(null);
}

async function run() {
	console.log(`Widget family: ${config.widgetFamily}`);
	
	const listWidget = new ListWidget();
	
	try {
		const fipsCode = await getFipsCode();

		if (!fipsCode) {
			throw "Please specify a 5-digit FIPS code for this widget to load county-level data.";
		}
		console.log(`Using FIPS code: ${fipsCode}`);

		// Fetch data for display in the widget
		
		const data = await getCovidData(fipsCode);
		console.log(data);
		
		const county = `${data.county}`;
		console.log({ county });
		
		const state = `${data.state}`;
		console.log({ state });
		
		const url = `${data.url}`;
		console.log({ url });
		
		const rlOverall = data.rlOverall;
		console.log({ rlOverall });
		const level = calculateLevel(rlOverall);
		
		// Prepare widget
		
		listWidget.url = url;
		
		var refreshDate = new Date();
		refreshDate.setHours( refreshDate.getHours() + 4 );
		listWidget.refreshAfterDate = refreshDate;
		
		if(config.widgetFamily == "small") {
			
			// Lay out small widget
			
			listWidget.setPadding(10, 15, 10, 10);
			
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
			const content = scoreStack.addText(data.caseDensity.metric.toFixed(1));
			content.textColor = textColor;
			content.font = Font.semiboldSystemFont(30);
			const riskSymbol = createSymbol(level.symbol);
			const riskImg = scoreStack.addImage(riskSymbol.image);
			riskImg.resizable = false;
			riskImg.tintColor = textColor;
			riskImg.imageSize = new Size(30, 36);
			const trendSymbolName = changeSymbolNameForComparison(data.caseDensity.changeIndicator);
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
			
			
		} else if(config.widgetFamily == "medium" || config.widgetFamily == null) {
			
			// Sizing parameters
			
			const SPACING_BETWEEN_METRICS = 35;
			
			// Lay out medium widget
			
			listWidget.setPadding(0, 0, 0, 0);
			
			const startColor = Color.dynamic(new Color(BACKGROUND_COLORS[LIGHT].startColor), new Color(BACKGROUND_COLORS[DARK].startColor));
			
			const endColor = Color.dynamic(new Color(BACKGROUND_COLORS[LIGHT].endColor), new Color(BACKGROUND_COLORS[DARK].endColor));
			
			const labelTextColor = Color.dynamic(new Color(BACKGROUND_COLORS[LIGHT].labelTextColor), new Color(BACKGROUND_COLORS[DARK].labelTextColor));
			
			const textColor = Color.dynamic(new Color(BACKGROUND_COLORS[LIGHT].textColor), new Color(BACKGROUND_COLORS[DARK].textColor));
			
			const gradient = new LinearGradient();
			
			gradient.colors = [startColor, endColor];
			gradient.locations = [0.0, 1];
			console.log({ gradient });
	
			listWidget.backgroundGradient = gradient;
			
			// Header: (Symbol) COVID Risk: (Level)
			
			const headerStack = listWidget.addStack();
			headerStack.centerAlignContent();
			headerStack.setPadding(5, 10, 5, 10);
			
			const headerStartColor = Color.dynamic(new Color(level.startColor), new Color(level.startColor));
			
			const headerEndColor = Color.dynamic(new Color(level.endColor), new Color(level.endColor));
			
			const headerTextColor = Color.dynamic(new Color(level.textColor), new Color(level.textColor));
			
			const headerGradient = new LinearGradient();
			headerGradient.colors = [headerStartColor, headerEndColor];
			headerGradient.locations = [0.0, 1];
			console.log({ headerGradient });
			
			headerStack.backgroundGradient = headerGradient;
			
			const riskSymbol = createSymbol(level.symbol);
			const riskImg = headerStack.addImage(riskSymbol.image);
			riskImg.resizable = false;
			riskImg.tintColor = headerTextColor;
			
			headerStack.addSpacer(5);
			
			const headerText = headerStack.addText(`${county}, ${state}: ${level.label}`);
			headerText.lineLimit = 1;
			headerText.textColor = headerTextColor;
			headerText.font = Font.semiboldSystemFont(16);
			headerText.minimumScaleFactor = 0.6;
			
			headerStack.addSpacer(null);
			
			// Content
			
			listWidget.addSpacer(null);
			
			// Horizontal Metric Area 1
			
			const metricStack1 = listWidget.addStack();
			
			metricStack1.addSpacer(null);
			
			// Horizontal Metric Area: Case Density
			
			const cdMetricStack = metricStack1.addStack();
			displayMetricStack(cdMetricStack, data.caseDensity, textColor)
			
			metricStack1.addSpacer(SPACING_BETWEEN_METRICS);
			
			// Horizontal Metric Area: Infection Rate
			
			const irMetricStack = metricStack1.addStack();
			displayMetricStack(irMetricStack, data.infectionRate, textColor)
			
			// Horizontal Metric Area 1 End
			
			metricStack1.addSpacer(null);
			
			listWidget.addSpacer(5);
			
			// Horizontal Metric Area 2
			
			const metricStack2 = listWidget.addStack();
			
			metricStack2.addSpacer(null);
			
			// Horizontal Metric Area: Positive Test Rate
			
			const tprMetricStack = metricStack2.addStack();
			displayMetricStack(tprMetricStack, data.testPositivityRatio, textColor)
			
			metricStack2.addSpacer(SPACING_BETWEEN_METRICS);
			
			// Horizontal Metric Area: ICU Headroom
			
			const icuMetricStack = metricStack2.addStack();
			displayMetricStack(icuMetricStack, data.icuHeadroomRatio, textColor)
			
			/*
			metricStack2.addSpacer(SPACING_BETWEEN_METRICS);
			
			// Horizontal Metric Area: Contact Tracers
			
			const ctMetricStack = metricStack2.addStack();
			displayMetricStack(ctMetricStack, data.contactTracerCapacityRatio, textColor)
			*/
			// Horizontal Metric Area 2 End
			
			metricStack2.addSpacer(null);
			
			const updatedDate = new Date(data.lastUpdatedDate).toLocaleDateString();

			const labelText = listWidget.addText(`COVID Act Now — Updated ${updatedDate}`.toUpperCase());
			labelText.centerAlignText()
			labelText.textColor = textColor;
			labelText.font = Font.regularSystemFont(11);
			labelText.minimumScaleFactor = 0.50;
			
			listWidget.addSpacer(5);
		}
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
		listWidget.presentMedium();
	}

	Script.setWidget(listWidget);
	Script.complete();
}

await run();