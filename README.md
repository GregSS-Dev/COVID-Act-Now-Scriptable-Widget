# COVID-Act-Now-Scriptable-Widget

![COVID Act Now Small Scriptable Widgets](https://raw.githubusercontent.com/GregSS-Dev/COVID-Act-Now-Scriptable-Widget/main/README-images/widgets.png)

![COVID Act Now Medium Scriptable Widget](https://raw.githubusercontent.com/GregSS-Dev/COVID-Act-Now-Scriptable-Widget/main/README-images/medium.png)

Widget to display COVID risk data from COVID Act Now (covidactnow.org) using Scriptable for iOS by Simon Støvring.

# About This Project

This project generates a widget that displays current COVID risk information on the home screen of devices running iOS 14 and iPadOS 14. It is displayed using the [Scriptable](https://scriptable.app) by Simon Støvring. 

The widget uses data from [COVID Act Now](https://covidactnow.org), a 501(c)(3) nonprofit founded in March 2020. The organization is committed to:

* **Data:** We support data- and science-backed policies and decision-making
* **Transparency:** Our data and methodologies are fully open-source so that the public can vet, freely use, and build upon our work
* **Accessibility:** We make data universally accessible so that anyone can easily understand and use it, regardless of ability or prior knowledge

The widget uses the FCC Data API -- specifically, the [Area API](https://geo.fcc.gov/api/census/) -- to determine the county FIPS code for you location. The 5-digit FIPS code is required by COVID Act Now’s API to uniquely identify each county.

# How to Install and Use the Widget

To use this widget, make a new script inside Scriptable and paste in the contents of `COVID-Act-Now.js`.

You can run the script from within the app, or add a new Small or Medium widget on your home screen, set it to Scriptable, and choose the script by tapping and holding on the widget, choosing Edit Widget, and choosing the script by tapping on the Script field.

![Widget Configuration](https://raw.githubusercontent.com/GregSS-Dev/COVID-Act-Now-Scriptable-Widget/main/README-images/configuration.png)

In the **Parameter** field, you can specify a five-digit FIPS code for the county you want to track. Or, leave this field blank, and the widget will display information for the county you are located in. (You can find FIPS code listings easily via Google. Try "FIPS Code for County Name, ST" as a search.

# Notices

This product uses the FCC Data API but is not endorsed or certified by the FCC.