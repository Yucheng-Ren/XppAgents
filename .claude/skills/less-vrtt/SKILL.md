---
name: less-vrtt
description: LESS and VRTT for D365 extensible controls. Covers building LESS styles, creating VRTT tests, and the difference between application and platform extensible controls.
user-invocable: false
---

# LESS and VRTT for extensible controls

With the Platform split, LESS and VRTT for extensible controls and extended styles has changed.

## Application extensible controls

### LESS for application extensible controls
LESS files have been moved out of the browser folder and into the AOT as resources in the appropriate model. These AOT resources are compiled using the LESS variables shipped by the client team. To reference the LESS variables shipped by the the client team, just start your LESS file with: `@import 'coreImports.less'`.  This will make our base colors, theme colors, units, and constant variables available for use, and your styles will be compile against each of the different themes and densities. There are other import files available like `utility.less` and `css3*.less` files, but using these for extensible controls is deprecated and these files may be removed at a later date.  

To create new LESS files as part of the application, add them to the AOT as a resource of type Data and then add an import statement for the the file in the `%inetroot%\Source\Packages\ApplicationSuite\Build\Styles\App.less` file. If the LESS file is stored in a model that doesn't have any existing LESS files, it may be necessary to modify the building of `app.less` done by `%inetroot%\Source\Packages\ApplicationSuite\Build\Styles\Styles.proj` and add this new directory to the list of `LessIncludePathList`.

Editing of LESS files may be done in Visual Studio by opening the AOT resource. To deploy and test the changes, you will need to do the following:

-  `cd %inetroot%\Source\Packages\ApplicationSuite\Build\Styles`
-  `quickbuild -parseroot .` (the dot is part of the command)
-  `copyToCSU.cmd`

### VRTT for application extensible controls 
VRTT tests for application controls should be written and placed in the  `%inetroot%\Source\Staging\Application\Source\ExtensibleControlStyles\vrttTests\` folder. "Gallery pages" for the application extensible controls are built by the `ExtensibleControlStyles.csproj`. There are pages in there you can modify to create your own test page.

To run the VRTT tests, you will need to build the `ExtensibleControlStyles` directory. Again this directory requires that the `%inetroot%\Source\Kernel\browser\` folder had been built (or the result of the build is present in the drop folder). To build, go this directory and run `build retail debug`.

-  `GetPlatform -BuildType Debug` (Only need to run once per deploy)
-  `cd %inetroot%\Source\Staging\Application\Source\ExtensibleControlStyles\`
-  `msbuild ExtensibleControlStyles.csproj*`
-  `vrtt.bat`

## Platform extensible controls
Platform extensible controls can now be treated similarly to Application extensible controls. The directions are the same as above with no GetPlatform needed since you're in the platform. In general, replace

    %inetroot%\Source\Staging\Application\Source\ExtensibleControlStyles\

with

    %inetroot%\Source\Staging\FoundationExtensibleControlStyles\

in the steps. 

## Courses on LESS
A short overview: http://lesscss.org/
A 2-hr course: https://app.pluralsight.com/library/courses/less-getting-started/table-of-contents
