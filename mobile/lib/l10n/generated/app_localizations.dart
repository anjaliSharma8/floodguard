import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_gu.dart';
import 'app_localizations_hi.dart';
import 'app_localizations_mr.dart';
import 'app_localizations_ta.dart';
import 'app_localizations_te.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('gu'),
    Locale('hi'),
    Locale('mr'),
    Locale('ta'),
    Locale('te'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'SankatSetu'**
  String get appTitle;

  /// No description provided for @apiNetworkError.
  ///
  /// In en, this message translates to:
  /// **'The app could not connect to the server. Check your connection and try again.'**
  String get apiNetworkError;

  /// No description provided for @apiTimeout.
  ///
  /// In en, this message translates to:
  /// **'The server request timed out. Check your connection and retry.'**
  String get apiTimeout;

  /// No description provided for @apiInvalidResponse.
  ///
  /// In en, this message translates to:
  /// **'The server returned data the app could not read.'**
  String get apiInvalidResponse;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @settings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// No description provided for @currentLanguage.
  ///
  /// In en, this message translates to:
  /// **'Current language'**
  String get currentLanguage;

  /// No description provided for @english.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get english;

  /// No description provided for @hindi.
  ///
  /// In en, this message translates to:
  /// **'हिन्दी'**
  String get hindi;

  /// No description provided for @marathi.
  ///
  /// In en, this message translates to:
  /// **'मराठी'**
  String get marathi;

  /// No description provided for @gujarati.
  ///
  /// In en, this message translates to:
  /// **'ગુજરાતી'**
  String get gujarati;

  /// No description provided for @tamil.
  ///
  /// In en, this message translates to:
  /// **'தமிழ்'**
  String get tamil;

  /// No description provided for @telugu.
  ///
  /// In en, this message translates to:
  /// **'తెలుగు'**
  String get telugu;

  /// No description provided for @welcome.
  ///
  /// In en, this message translates to:
  /// **'Your safety, our priority'**
  String get welcome;

  /// No description provided for @welcomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome to SankatSetu'**
  String get welcomeTitle;

  /// No description provided for @welcomeDescription.
  ///
  /// In en, this message translates to:
  /// **'Emergency guidance and essential safety features are available without an account.'**
  String get welcomeDescription;

  /// No description provided for @continueAsGuest.
  ///
  /// In en, this message translates to:
  /// **'Continue as Guest'**
  String get continueAsGuest;

  /// No description provided for @login.
  ///
  /// In en, this message translates to:
  /// **'Login'**
  String get login;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signIn;

  /// No description provided for @signUp.
  ///
  /// In en, this message translates to:
  /// **'Sign Up'**
  String get signUp;

  /// No description provided for @createAccount.
  ///
  /// In en, this message translates to:
  /// **'Create Account / Sign Up'**
  String get createAccount;

  /// No description provided for @createYourAccount.
  ///
  /// In en, this message translates to:
  /// **'Create your account'**
  String get createYourAccount;

  /// No description provided for @signUpDescription.
  ///
  /// In en, this message translates to:
  /// **'Sign up for a SankatSetu citizen account.'**
  String get signUpDescription;

  /// No description provided for @signInDescription.
  ///
  /// In en, this message translates to:
  /// **'Sign in to continue to your safety dashboard.'**
  String get signInDescription;

  /// No description provided for @fullName.
  ///
  /// In en, this message translates to:
  /// **'Full Name'**
  String get fullName;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @confirmPassword.
  ///
  /// In en, this message translates to:
  /// **'Confirm Password'**
  String get confirmPassword;

  /// No description provided for @phoneOptional.
  ///
  /// In en, this message translates to:
  /// **'Phone (optional)'**
  String get phoneOptional;

  /// No description provided for @showPassword.
  ///
  /// In en, this message translates to:
  /// **'Show password'**
  String get showPassword;

  /// No description provided for @hidePassword.
  ///
  /// In en, this message translates to:
  /// **'Hide password'**
  String get hidePassword;

  /// No description provided for @showConfirmPassword.
  ///
  /// In en, this message translates to:
  /// **'Show confirm password'**
  String get showConfirmPassword;

  /// No description provided for @hideConfirmPassword.
  ///
  /// In en, this message translates to:
  /// **'Hide confirm password'**
  String get hideConfirmPassword;

  /// No description provided for @enterFullName.
  ///
  /// In en, this message translates to:
  /// **'Enter your full name.'**
  String get enterFullName;

  /// No description provided for @enterEmail.
  ///
  /// In en, this message translates to:
  /// **'Enter your email address.'**
  String get enterEmail;

  /// No description provided for @validEmail.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email address.'**
  String get validEmail;

  /// No description provided for @enterPassword.
  ///
  /// In en, this message translates to:
  /// **'Enter your password.'**
  String get enterPassword;

  /// No description provided for @passwordMinLength.
  ///
  /// In en, this message translates to:
  /// **'Password must be at least 6 characters.'**
  String get passwordMinLength;

  /// No description provided for @confirmYourPassword.
  ///
  /// In en, this message translates to:
  /// **'Confirm your password.'**
  String get confirmYourPassword;

  /// No description provided for @passwordsMismatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match.'**
  String get passwordsMismatch;

  /// No description provided for @alreadyHaveAccount.
  ///
  /// In en, this message translates to:
  /// **'Already have an account? Login'**
  String get alreadyHaveAccount;

  /// No description provided for @newToApp.
  ///
  /// In en, this message translates to:
  /// **'New to SankatSetu? Sign Up'**
  String get newToApp;

  /// No description provided for @backToWelcome.
  ///
  /// In en, this message translates to:
  /// **'Back to welcome options'**
  String get backToWelcome;

  /// No description provided for @home.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get home;

  /// No description provided for @homeRegion.
  ///
  /// In en, this message translates to:
  /// **'Pune, Maharashtra'**
  String get homeRegion;

  /// No description provided for @map.
  ///
  /// In en, this message translates to:
  /// **'Risk Map'**
  String get map;

  /// No description provided for @reports.
  ///
  /// In en, this message translates to:
  /// **'Reports'**
  String get reports;

  /// No description provided for @emergency.
  ///
  /// In en, this message translates to:
  /// **'Emergency'**
  String get emergency;

  /// No description provided for @safeRoutes.
  ///
  /// In en, this message translates to:
  /// **'Safe Route Planner'**
  String get safeRoutes;

  /// No description provided for @alerts.
  ///
  /// In en, this message translates to:
  /// **'Disaster Alerts'**
  String get alerts;

  /// No description provided for @offlineGuide.
  ///
  /// In en, this message translates to:
  /// **'Preparedness Guide'**
  String get offlineGuide;

  /// No description provided for @assistant.
  ///
  /// In en, this message translates to:
  /// **'Emergency Assistant'**
  String get assistant;

  /// No description provided for @savedInfo.
  ///
  /// In en, this message translates to:
  /// **'Saved Information'**
  String get savedInfo;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get logout;

  /// No description provided for @signOutGuest.
  ///
  /// In en, this message translates to:
  /// **'Sign out of guest mode'**
  String get signOutGuest;

  /// No description provided for @guestAccessActive.
  ///
  /// In en, this message translates to:
  /// **'Guest access is active. Emergency and safety features are available without an account.'**
  String get guestAccessActive;

  /// No description provided for @signedInNotice.
  ///
  /// In en, this message translates to:
  /// **'Signed in as a citizen. Report submission uses your server-issued account token.'**
  String get signedInNotice;

  /// No description provided for @floodRiskUpdates.
  ///
  /// In en, this message translates to:
  /// **'Flood risk updates'**
  String get floodRiskUpdates;

  /// No description provided for @liveRiskUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Live flood-risk monitoring is not available yet. Check official alerts before travelling.'**
  String get liveRiskUnavailable;

  /// No description provided for @emergencyActions.
  ///
  /// In en, this message translates to:
  /// **'Emergency actions'**
  String get emergencyActions;

  /// No description provided for @findEmergencyHelp.
  ///
  /// In en, this message translates to:
  /// **'Find emergency help and nearby facilities'**
  String get findEmergencyHelp;

  /// No description provided for @compareRoutes.
  ///
  /// In en, this message translates to:
  /// **'Compare safer routes and avoid flooded roads'**
  String get compareRoutes;

  /// No description provided for @reportWaterlogging.
  ///
  /// In en, this message translates to:
  /// **'Report waterlogging or blocked roads'**
  String get reportWaterlogging;

  /// No description provided for @moreTools.
  ///
  /// In en, this message translates to:
  /// **'More tools'**
  String get moreTools;

  /// No description provided for @keepSuppliesReady.
  ///
  /// In en, this message translates to:
  /// **'Keep essential supplies and emergency contacts ready.'**
  String get keepSuppliesReady;

  /// No description provided for @currentRisk.
  ///
  /// In en, this message translates to:
  /// **'Road status from backend data'**
  String get currentRisk;

  /// No description provided for @demoData.
  ///
  /// In en, this message translates to:
  /// **'Road and incident data may include seeded demo records.'**
  String get demoData;

  /// No description provided for @loading.
  ///
  /// In en, this message translates to:
  /// **'Loading...'**
  String get loading;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @connected.
  ///
  /// In en, this message translates to:
  /// **'Backend reachable'**
  String get connected;

  /// No description provided for @offline.
  ///
  /// In en, this message translates to:
  /// **'Backend unavailable — offline guidance remains available'**
  String get offline;

  /// No description provided for @notDispatch.
  ///
  /// In en, this message translates to:
  /// **'This app does not contact emergency dispatch.'**
  String get notDispatch;

  /// No description provided for @sosCall.
  ///
  /// In en, this message translates to:
  /// **'SOS · Open dialer for 101'**
  String get sosCall;

  /// No description provided for @callYourselfNotice.
  ///
  /// In en, this message translates to:
  /// **'The app cannot send your location or contact a rescue team. You must place the call yourself.'**
  String get callYourselfNotice;

  /// No description provided for @gettingLocation.
  ///
  /// In en, this message translates to:
  /// **'Getting location...'**
  String get gettingLocation;

  /// No description provided for @showMyLocation.
  ///
  /// In en, this message translates to:
  /// **'Show my location'**
  String get showMyLocation;

  /// No description provided for @yourLocation.
  ///
  /// In en, this message translates to:
  /// **'Your location: {location}'**
  String yourLocation(Object location);

  /// No description provided for @alertsInAppOnly.
  ///
  /// In en, this message translates to:
  /// **'In-app advisories only'**
  String get alertsInAppOnly;

  /// No description provided for @alertsNoPushNotice.
  ///
  /// In en, this message translates to:
  /// **'Push notifications are not configured. This screen does not run as an emergency alert service.'**
  String get alertsNoPushNotice;

  /// No description provided for @alertsDataNotice.
  ///
  /// In en, this message translates to:
  /// **'There is no dedicated alerts or push-notification service. These in-app advisories come from road and report records and may include demo data.'**
  String get alertsDataNotice;

  /// No description provided for @followAuthorities.
  ///
  /// In en, this message translates to:
  /// **'Follow instructions from local authorities and official emergency services.'**
  String get followAuthorities;

  /// No description provided for @evacuateWhenTold.
  ///
  /// In en, this message translates to:
  /// **'Evacuate promptly when authorities instruct you to do so. Use a route confirmed safe by authorities; do not rely on an app route alone.'**
  String get evacuateWhenTold;

  /// No description provided for @neverEnterFloodwater.
  ///
  /// In en, this message translates to:
  /// **'Never walk, swim or drive through floodwater. Depth, current, open drains and road damage may be hidden.'**
  String get neverEnterFloodwater;

  /// No description provided for @avoidPowerLines.
  ///
  /// In en, this message translates to:
  /// **'Stay away from fallen power lines and electrical equipment in or near water. Do not touch wet switches.'**
  String get avoidPowerLines;

  /// No description provided for @safeWater.
  ///
  /// In en, this message translates to:
  /// **'Drink sealed or treated water. Avoid water that may be contaminated by floodwater.'**
  String get safeWater;

  /// No description provided for @returnOnlyWhenSafe.
  ///
  /// In en, this message translates to:
  /// **'Return only when authorities say it is safe. Flooded buildings may have structural, electrical or gas hazards.'**
  String get returnOnlyWhenSafe;

  /// No description provided for @reportDontInvestigate.
  ///
  /// In en, this message translates to:
  /// **'Keep away from standing water, damaged bridges and fallen wires. Report hazards; do not approach to investigate.'**
  String get reportDontInvestigate;

  /// No description provided for @emergencyGuidanceDisclaimer.
  ///
  /// In en, this message translates to:
  /// **'This guidance is not a live alert or a substitute for emergency services and local authority instructions.'**
  String get emergencyGuidanceDisclaimer;

  /// No description provided for @before.
  ///
  /// In en, this message translates to:
  /// **'Before a flood'**
  String get before;

  /// No description provided for @during.
  ///
  /// In en, this message translates to:
  /// **'During a flood'**
  String get during;

  /// No description provided for @after.
  ///
  /// In en, this message translates to:
  /// **'After a flood'**
  String get after;

  /// No description provided for @safeRouteTitle.
  ///
  /// In en, this message translates to:
  /// **'Safe Route Planner'**
  String get safeRouteTitle;

  /// No description provided for @findSaferWay.
  ///
  /// In en, this message translates to:
  /// **'Find a Safer Way'**
  String get findSaferWay;

  /// No description provided for @routeIntro.
  ///
  /// In en, this message translates to:
  /// **'Plan your journey while avoiding potentially flooded areas.'**
  String get routeIntro;

  /// No description provided for @useCurrentLocation.
  ///
  /// In en, this message translates to:
  /// **'Use My Current Location'**
  String get useCurrentLocation;

  /// No description provided for @destination.
  ///
  /// In en, this message translates to:
  /// **'Destination'**
  String get destination;

  /// No description provided for @selectDestination.
  ///
  /// In en, this message translates to:
  /// **'Select destination'**
  String get selectDestination;

  /// No description provided for @routePreference.
  ///
  /// In en, this message translates to:
  /// **'Route Preference'**
  String get routePreference;

  /// No description provided for @safestRoute.
  ///
  /// In en, this message translates to:
  /// **'Safest Route'**
  String get safestRoute;

  /// No description provided for @shortestRoute.
  ///
  /// In en, this message translates to:
  /// **'Shortest Route'**
  String get shortestRoute;

  /// No description provided for @routeMap.
  ///
  /// In en, this message translates to:
  /// **'Route Map'**
  String get routeMap;

  /// No description provided for @findSafeRoute.
  ///
  /// In en, this message translates to:
  /// **'Find Safe Route'**
  String get findSafeRoute;

  /// No description provided for @routeSafetyNotice.
  ///
  /// In en, this message translates to:
  /// **'Safety Notice\nAvoid waterlogged roads and never cross flowing floodwater. Follow official emergency instructions. Route results use available road-network data and are not a substitute for official emergency guidance.'**
  String get routeSafetyNotice;

  /// No description provided for @routeNotLiveNavigation.
  ///
  /// In en, this message translates to:
  /// **'The road network is a demo map, not live navigation. Confirm conditions and route safety with local authorities.'**
  String get routeNotLiveNavigation;

  /// No description provided for @floodRiskMap.
  ///
  /// In en, this message translates to:
  /// **'Flood risk map'**
  String get floodRiskMap;

  /// No description provided for @refreshMapData.
  ///
  /// In en, this message translates to:
  /// **'Refresh map data'**
  String get refreshMapData;

  /// No description provided for @lowRisk.
  ///
  /// In en, this message translates to:
  /// **'Low risk'**
  String get lowRisk;

  /// No description provided for @mediumRisk.
  ///
  /// In en, this message translates to:
  /// **'Medium risk'**
  String get mediumRisk;

  /// No description provided for @highRisk.
  ///
  /// In en, this message translates to:
  /// **'High risk'**
  String get highRisk;

  /// No description provided for @blockedRoad.
  ///
  /// In en, this message translates to:
  /// **'Blocked road'**
  String get blockedRoad;

  /// No description provided for @communityReport.
  ///
  /// In en, this message translates to:
  /// **'Community report'**
  String get communityReport;

  /// No description provided for @communityIncidents.
  ///
  /// In en, this message translates to:
  /// **'Community incidents'**
  String get communityIncidents;

  /// No description provided for @reportIncident.
  ///
  /// In en, this message translates to:
  /// **'Report incident'**
  String get reportIncident;

  /// No description provided for @reportFormTitle.
  ///
  /// In en, this message translates to:
  /// **'Report an incident'**
  String get reportFormTitle;

  /// No description provided for @currentLocation.
  ///
  /// In en, this message translates to:
  /// **'Current location'**
  String get currentLocation;

  /// No description provided for @signInToReport.
  ///
  /// In en, this message translates to:
  /// **'Sign in to submit a report'**
  String get signInToReport;

  /// No description provided for @publicReportFeed.
  ///
  /// In en, this message translates to:
  /// **'Viewing reports is public; submitting requires a citizen account.'**
  String get publicReportFeed;

  /// No description provided for @noIncidentReports.
  ///
  /// In en, this message translates to:
  /// **'No incident reports are available.'**
  String get noIncidentReports;

  /// No description provided for @reportSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Report submitted'**
  String get reportSubmitted;

  /// No description provided for @reportUnverified.
  ///
  /// In en, this message translates to:
  /// **'The server recorded this report as \"{status}\". It has not been verified by an authority.'**
  String reportUnverified(Object status);

  /// No description provided for @done.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get done;

  /// No description provided for @incidentType.
  ///
  /// In en, this message translates to:
  /// **'Incident type'**
  String get incidentType;

  /// No description provided for @severity.
  ///
  /// In en, this message translates to:
  /// **'Severity reported by you'**
  String get severity;

  /// No description provided for @locationName.
  ///
  /// In en, this message translates to:
  /// **'Location name'**
  String get locationName;

  /// No description provided for @mappedLocationHint.
  ///
  /// In en, this message translates to:
  /// **'Area or mapped location'**
  String get mappedLocationHint;

  /// No description provided for @description.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get description;

  /// No description provided for @hazardDescriptionHint.
  ///
  /// In en, this message translates to:
  /// **'Describe the hazard or assistance needed'**
  String get hazardDescriptionHint;

  /// No description provided for @chooseMappedPoint.
  ///
  /// In en, this message translates to:
  /// **'Choose a mapped point (optional)'**
  String get chooseMappedPoint;

  /// No description provided for @selectKnownPoint.
  ///
  /// In en, this message translates to:
  /// **'Select a known map point'**
  String get selectKnownPoint;

  /// No description provided for @relatedRoad.
  ///
  /// In en, this message translates to:
  /// **'Related road (optional)'**
  String get relatedRoad;

  /// No description provided for @noSpecificRoad.
  ///
  /// In en, this message translates to:
  /// **'No specific road'**
  String get noSpecificRoad;

  /// No description provided for @useGpsLocation.
  ///
  /// In en, this message translates to:
  /// **'Use current GPS location'**
  String get useGpsLocation;

  /// No description provided for @submitting.
  ///
  /// In en, this message translates to:
  /// **'Submitting...'**
  String get submitting;

  /// No description provided for @submitReport.
  ///
  /// In en, this message translates to:
  /// **'Submit report'**
  String get submitReport;

  /// No description provided for @enterLocationName.
  ///
  /// In en, this message translates to:
  /// **'Enter a location name.'**
  String get enterLocationName;

  /// No description provided for @describeIncident.
  ///
  /// In en, this message translates to:
  /// **'Describe what happened.'**
  String get describeIncident;

  /// No description provided for @chooseAccurateLocation.
  ///
  /// In en, this message translates to:
  /// **'Choose a mapped location or grant location permission. A text-only location cannot be accurately placed on the incident map.'**
  String get chooseAccurateLocation;

  /// No description provided for @emergencyAssistant.
  ///
  /// In en, this message translates to:
  /// **'Emergency assistant'**
  String get emergencyAssistant;

  /// No description provided for @assistantResponseLanguage.
  ///
  /// In en, this message translates to:
  /// **'Response language: {language}'**
  String assistantResponseLanguage(Object language);

  /// No description provided for @assistantSafetyNotice.
  ///
  /// In en, this message translates to:
  /// **'Replies come from the backend chatbot and may be incomplete. They are not verified emergency guidance and do not confirm live conditions, facility availability, route safety or dispatch.'**
  String get assistantSafetyNotice;

  /// No description provided for @askFloodSafety.
  ///
  /// In en, this message translates to:
  /// **'Ask a flood-safety question'**
  String get askFloodSafety;

  /// No description provided for @sendMessage.
  ///
  /// In en, this message translates to:
  /// **'Send message'**
  String get sendMessage;

  /// No description provided for @assistantUnavailable.
  ///
  /// In en, this message translates to:
  /// **'The assistant service is unavailable. Use the offline emergency guide for basic safety steps. For immediate danger, contact local emergency services directly. This app cannot confirm live conditions or route safety.'**
  String get assistantUnavailable;

  /// No description provided for @assistantQuestionEvacuation.
  ///
  /// In en, this message translates to:
  /// **'When should I evacuate during a flood?'**
  String get assistantQuestionEvacuation;

  /// No description provided for @assistantQuestionFloodwater.
  ///
  /// In en, this message translates to:
  /// **'Why should I avoid floodwater?'**
  String get assistantQuestionFloodwater;

  /// No description provided for @assistantQuestionSupplies.
  ///
  /// In en, this message translates to:
  /// **'What should I pack in an emergency kit?'**
  String get assistantQuestionSupplies;

  /// No description provided for @savedInformation.
  ///
  /// In en, this message translates to:
  /// **'Saved information'**
  String get savedInformation;

  /// No description provided for @noSavedItems.
  ///
  /// In en, this message translates to:
  /// **'No saved items yet. Save a route or an emergency facility to keep it on this device.'**
  String get noSavedItems;

  /// No description provided for @removeSavedItem.
  ///
  /// In en, this message translates to:
  /// **'Remove saved item'**
  String get removeSavedItem;

  /// No description provided for @retryAction.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retryAction;

  /// No description provided for @backendRecordsNotice.
  ///
  /// In en, this message translates to:
  /// **'Backend records can include seeded demo data and may not reflect live conditions.'**
  String get backendRecordsNotice;

  /// No description provided for @updateTimeNotProvided.
  ///
  /// In en, this message translates to:
  /// **'Update time not provided'**
  String get updateTimeNotProvided;

  /// No description provided for @high.
  ///
  /// In en, this message translates to:
  /// **'High'**
  String get high;

  /// No description provided for @medium.
  ///
  /// In en, this message translates to:
  /// **'Medium'**
  String get medium;

  /// No description provided for @low.
  ///
  /// In en, this message translates to:
  /// **'Low'**
  String get low;

  /// No description provided for @unknown.
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get unknown;

  /// No description provided for @saveLanguageError.
  ///
  /// In en, this message translates to:
  /// **'Could not save language preference: {error}'**
  String saveLanguageError(Object error);

  /// No description provided for @startupRestoreError.
  ///
  /// In en, this message translates to:
  /// **'Could not restore saved app settings: {error}'**
  String startupRestoreError(Object error);

  /// No description provided for @sessionVerifyOffline.
  ///
  /// In en, this message translates to:
  /// **'Could not verify your saved sign-in. Continuing with the saved session while offline.'**
  String get sessionVerifyOffline;

  /// No description provided for @signOutError.
  ///
  /// In en, this message translates to:
  /// **'Could not sign out safely: {error}'**
  String signOutError(Object error);

  /// No description provided for @saveGuestError.
  ///
  /// In en, this message translates to:
  /// **'Could not save guest session: {error}'**
  String saveGuestError(Object error);

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile and Settings'**
  String get settingsTitle;

  /// No description provided for @languageUpdated.
  ///
  /// In en, this message translates to:
  /// **'Language updated'**
  String get languageUpdated;

  /// No description provided for @roadRiskAdvisory.
  ///
  /// In en, this message translates to:
  /// **'Road risk advisory'**
  String get roadRiskAdvisory;

  /// No description provided for @roadReportedBlocked.
  ///
  /// In en, this message translates to:
  /// **'Road reported blocked'**
  String get roadReportedBlocked;

  /// No description provided for @criticalWaterlogging.
  ///
  /// In en, this message translates to:
  /// **'Critical waterlogging status'**
  String get criticalWaterlogging;

  /// No description provided for @source.
  ///
  /// In en, this message translates to:
  /// **'Source'**
  String get source;

  /// No description provided for @updated.
  ///
  /// In en, this message translates to:
  /// **'Updated'**
  String get updated;

  /// No description provided for @reviewStatus.
  ///
  /// In en, this message translates to:
  /// **'Review status'**
  String get reviewStatus;

  /// No description provided for @availableOffline.
  ///
  /// In en, this message translates to:
  /// **'Available offline'**
  String get availableOffline;

  /// No description provided for @emergencyKit.
  ///
  /// In en, this message translates to:
  /// **'Emergency kit'**
  String get emergencyKit;

  /// No description provided for @guidanceBundled.
  ///
  /// In en, this message translates to:
  /// **'Guidance is bundled with the app; no network is needed.'**
  String get guidanceBundled;

  /// No description provided for @guideBefore.
  ///
  /// In en, this message translates to:
  /// **'Before flooding'**
  String get guideBefore;

  /// No description provided for @guideDuring.
  ///
  /// In en, this message translates to:
  /// **'During flooding'**
  String get guideDuring;

  /// No description provided for @guideAfter.
  ///
  /// In en, this message translates to:
  /// **'After flooding'**
  String get guideAfter;

  /// No description provided for @guideInclusive.
  ///
  /// In en, this message translates to:
  /// **'Inclusive assistance'**
  String get guideInclusive;

  /// No description provided for @readOfficialInstructions.
  ///
  /// In en, this message translates to:
  /// **'Read official instructions'**
  String get readOfficialInstructions;

  /// No description provided for @fireRescue.
  ///
  /// In en, this message translates to:
  /// **'Fire and Rescue'**
  String get fireRescue;

  /// No description provided for @dialerOpened.
  ///
  /// In en, this message translates to:
  /// **'Phone dialer opened for {name}. This app did not send an SOS or dispatch message.'**
  String dialerOpened(Object name);

  /// No description provided for @noDialableNumber.
  ///
  /// In en, this message translates to:
  /// **'No dialable number is provided for {name}.'**
  String noDialableNumber(Object name);

  /// No description provided for @dialerUnavailable.
  ///
  /// In en, this message translates to:
  /// **'This device could not open a phone dialer for {name}.'**
  String dialerUnavailable(Object name);

  /// No description provided for @dialerError.
  ///
  /// In en, this message translates to:
  /// **'Could not open the phone dialer: {error}'**
  String dialerError(Object error);

  /// No description provided for @openMap.
  ///
  /// In en, this message translates to:
  /// **'Open map'**
  String get openMap;

  /// No description provided for @noMapApp.
  ///
  /// In en, this message translates to:
  /// **'No map application could open this location.'**
  String get noMapApp;

  /// No description provided for @mapAppError.
  ///
  /// In en, this message translates to:
  /// **'Could not open a map application: {error}'**
  String mapAppError(Object error);

  /// No description provided for @savedOnDevice.
  ///
  /// In en, this message translates to:
  /// **'{name} saved on this device.'**
  String savedOnDevice(Object name);

  /// No description provided for @saveInformationError.
  ///
  /// In en, this message translates to:
  /// **'Could not save this information: {error}'**
  String saveInformationError(Object error);

  /// No description provided for @emergencyFacilities.
  ///
  /// In en, this message translates to:
  /// **'Emergency facilities'**
  String get emergencyFacilities;

  /// No description provided for @hospitals.
  ///
  /// In en, this message translates to:
  /// **'Hospitals'**
  String get hospitals;

  /// No description provided for @shelters.
  ///
  /// In en, this message translates to:
  /// **'Shelters'**
  String get shelters;

  /// No description provided for @noFacilityRecords.
  ///
  /// In en, this message translates to:
  /// **'No emergency facility records returned.'**
  String get noFacilityRecords;

  /// No description provided for @noHospitalRecords.
  ///
  /// In en, this message translates to:
  /// **'No hospital records returned.'**
  String get noHospitalRecords;

  /// No description provided for @noShelterRecords.
  ///
  /// In en, this message translates to:
  /// **'No shelter records returned.'**
  String get noShelterRecords;

  /// No description provided for @facilityDataNotice.
  ///
  /// In en, this message translates to:
  /// **'Emergency facility and capacity details come from backend records and may be seeded or outdated. Confirm directly with the facility before travelling.'**
  String get facilityDataNotice;

  /// No description provided for @beds.
  ///
  /// In en, this message translates to:
  /// **'Beds'**
  String get beds;

  /// No description provided for @icu.
  ///
  /// In en, this message translates to:
  /// **'ICU'**
  String get icu;

  /// No description provided for @traumaCenterListed.
  ///
  /// In en, this message translates to:
  /// **'The backend lists a trauma center. Availability is not confirmed live.'**
  String get traumaCenterListed;

  /// No description provided for @traumaCenterNotListed.
  ///
  /// In en, this message translates to:
  /// **'No trauma center is listed by the backend.'**
  String get traumaCenterNotListed;

  /// No description provided for @petFriendly.
  ///
  /// In en, this message translates to:
  /// **'Pet-friendly'**
  String get petFriendly;

  /// No description provided for @wheelchairAccessible.
  ///
  /// In en, this message translates to:
  /// **'Wheelchair accessible'**
  String get wheelchairAccessible;

  /// No description provided for @listed.
  ///
  /// In en, this message translates to:
  /// **'listed'**
  String get listed;

  /// No description provided for @notListed.
  ///
  /// In en, this message translates to:
  /// **'not listed'**
  String get notListed;

  /// No description provided for @contact.
  ///
  /// In en, this message translates to:
  /// **'Contact'**
  String get contact;

  /// No description provided for @coordinates.
  ///
  /// In en, this message translates to:
  /// **'Coordinates'**
  String get coordinates;

  /// No description provided for @openRouteMap.
  ///
  /// In en, this message translates to:
  /// **'Open route map'**
  String get openRouteMap;

  /// No description provided for @errorGeneric.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. Please try again.'**
  String get errorGeneric;

  /// No description provided for @networkUnavailable.
  ///
  /// In en, this message translates to:
  /// **'The requested data is unavailable.'**
  String get networkUnavailable;

  /// No description provided for @mapTilesUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Map tiles are unavailable. Road and incident data are shown from the backend; the base map needs internet access.'**
  String get mapTilesUnavailable;

  /// No description provided for @noRoadNetwork.
  ///
  /// In en, this message translates to:
  /// **'Road network data is unavailable.'**
  String get noRoadNetwork;

  /// No description provided for @refreshReports.
  ///
  /// In en, this message translates to:
  /// **'Refresh reports'**
  String get refreshReports;

  /// No description provided for @reportsDataNotice.
  ///
  /// In en, this message translates to:
  /// **'Reports are server records and may include seeded demo entries. Citizen submissions remain unverified until reviewed by an authority.'**
  String get reportsDataNotice;

  /// No description provided for @reportingDataNotice.
  ///
  /// In en, this message translates to:
  /// **'Reports are sent to the backend for review. The app cannot dispatch rescue services, and this API does not accept image uploads.'**
  String get reportingDataNotice;

  /// No description provided for @mappedLocationsUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Mapped locations are unavailable; GPS can still provide coordinates.'**
  String get mappedLocationsUnavailable;

  /// No description provided for @positionSource.
  ///
  /// In en, this message translates to:
  /// **'Position source'**
  String get positionSource;

  /// No description provided for @gpsPermissionGranted.
  ///
  /// In en, this message translates to:
  /// **'GPS location (permission granted)'**
  String get gpsPermissionGranted;

  /// No description provided for @selectedMappedPoint.
  ///
  /// In en, this message translates to:
  /// **'Selected mapped road-network point'**
  String get selectedMappedPoint;

  /// No description provided for @reporting.
  ///
  /// In en, this message translates to:
  /// **'Report'**
  String get reporting;

  /// No description provided for @locationUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Location unavailable'**
  String get locationUnavailable;

  /// No description provided for @getRouteError.
  ///
  /// In en, this message translates to:
  /// **'Unable to calculate route.'**
  String get getRouteError;

  /// No description provided for @routeNotFound.
  ///
  /// In en, this message translates to:
  /// **'No feasible route found.'**
  String get routeNotFound;

  /// No description provided for @noFeasibleRoute.
  ///
  /// In en, this message translates to:
  /// **'No feasible route available.'**
  String get noFeasibleRoute;

  /// No description provided for @differentRoutePoints.
  ///
  /// In en, this message translates to:
  /// **'Starting point and destination must be different.'**
  String get differentRoutePoints;

  /// No description provided for @saveRouteError.
  ///
  /// In en, this message translates to:
  /// **'Could not save this route: {error}'**
  String saveRouteError(Object error);

  /// No description provided for @routeSaved.
  ///
  /// In en, this message translates to:
  /// **'Route saved on this device.'**
  String get routeSaved;

  /// No description provided for @startingPoint.
  ///
  /// In en, this message translates to:
  /// **'Starting point'**
  String get startingPoint;

  /// No description provided for @selectStartingPoint.
  ///
  /// In en, this message translates to:
  /// **'Select starting point'**
  String get selectStartingPoint;

  /// No description provided for @gettingCurrentLocation.
  ///
  /// In en, this message translates to:
  /// **'Getting current location...'**
  String get gettingCurrentLocation;

  /// No description provided for @gpsNotAvailable.
  ///
  /// In en, this message translates to:
  /// **'GPS location is unavailable.'**
  String get gpsNotAvailable;

  /// No description provided for @nearestRoadNodeUnavailable.
  ///
  /// In en, this message translates to:
  /// **'No road-network nodes are available to use as a starting point.'**
  String get nearestRoadNodeUnavailable;

  /// No description provided for @outsideRoadNetwork.
  ///
  /// In en, this message translates to:
  /// **'Outside the available Pune road network: the nearest node, {node}, is {distance} km away (maximum {maximum} km). No starting node was selected.'**
  String outsideRoadNetwork(Object node, Object distance, Object maximum);

  /// No description provided for @detectedGpsLocation.
  ///
  /// In en, this message translates to:
  /// **'Detected GPS location: {location}.'**
  String detectedGpsLocation(Object location);

  /// No description provided for @selectedStartingNode.
  ///
  /// In en, this message translates to:
  /// **'Selected starting node: {node} ({distance} km away).'**
  String selectedStartingNode(Object node, Object distance);

  /// No description provided for @noAlerts.
  ///
  /// In en, this message translates to:
  /// **'No road-risk advisories or open reports were returned by the backend.'**
  String get noAlerts;

  /// No description provided for @critical.
  ///
  /// In en, this message translates to:
  /// **'Critical'**
  String get critical;

  /// No description provided for @roadNetwork.
  ///
  /// In en, this message translates to:
  /// **'Road network'**
  String get roadNetwork;

  /// No description provided for @backendStatus.
  ///
  /// In en, this message translates to:
  /// **'Backend status'**
  String get backendStatus;

  /// No description provided for @riskScore.
  ///
  /// In en, this message translates to:
  /// **'Risk score'**
  String get riskScore;

  /// No description provided for @caution.
  ///
  /// In en, this message translates to:
  /// **'Caution'**
  String get caution;

  /// No description provided for @clear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get clear;

  /// No description provided for @verified.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get verified;

  /// No description provided for @rejected.
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get rejected;

  /// No description provided for @resolved.
  ///
  /// In en, this message translates to:
  /// **'Resolved'**
  String get resolved;

  /// No description provided for @underReview.
  ///
  /// In en, this message translates to:
  /// **'Under Review'**
  String get underReview;

  /// No description provided for @refresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get refresh;

  /// No description provided for @lowRiskLegend.
  ///
  /// In en, this message translates to:
  /// **'Low risk'**
  String get lowRiskLegend;

  /// No description provided for @mediumRiskLegend.
  ///
  /// In en, this message translates to:
  /// **'Medium risk'**
  String get mediumRiskLegend;

  /// No description provided for @highRiskLegend.
  ///
  /// In en, this message translates to:
  /// **'High / blocked'**
  String get highRiskLegend;

  /// No description provided for @roadNode.
  ///
  /// In en, this message translates to:
  /// **'Road node'**
  String get roadNode;

  /// No description provided for @communityReportLegend.
  ///
  /// In en, this message translates to:
  /// **'Community report'**
  String get communityReportLegend;

  /// No description provided for @mapTilesError.
  ///
  /// In en, this message translates to:
  /// **'Map tiles are unavailable. Road and incident data are shown from the backend; the base map needs internet access.'**
  String get mapTilesError;

  /// No description provided for @loadingLocations.
  ///
  /// In en, this message translates to:
  /// **'Loading locations from {baseUrl}...'**
  String loadingLocations(Object baseUrl);

  /// No description provided for @noRoadLocations.
  ///
  /// In en, this message translates to:
  /// **'No road locations are currently available.'**
  String get noRoadLocations;

  /// No description provided for @retryLoadingLocations.
  ///
  /// In en, this message translates to:
  /// **'Retry loading locations'**
  String get retryLoadingLocations;

  /// No description provided for @routeTilesUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Map tiles are unavailable. Route calculation still uses backend road-graph data.'**
  String get routeTilesUnavailable;

  /// No description provided for @routeDetails.
  ///
  /// In en, this message translates to:
  /// **'{route} route details'**
  String routeDetails(Object route);

  /// No description provided for @blockedRouteWarning.
  ///
  /// In en, this message translates to:
  /// **'Warning: this route includes a road marked blocked. Do not travel this route; follow current local authority guidance.'**
  String get blockedRouteWarning;

  /// No description provided for @distance.
  ///
  /// In en, this message translates to:
  /// **'Distance'**
  String get distance;

  /// No description provided for @estimatedTime.
  ///
  /// In en, this message translates to:
  /// **'Estimated time'**
  String get estimatedTime;

  /// No description provided for @averageRisk.
  ///
  /// In en, this message translates to:
  /// **'Average risk'**
  String get averageRisk;

  /// No description provided for @maximumRisk.
  ///
  /// In en, this message translates to:
  /// **'Maximum risk'**
  String get maximumRisk;

  /// No description provided for @safetyRating.
  ///
  /// In en, this message translates to:
  /// **'Safety rating'**
  String get safetyRating;

  /// No description provided for @roadByRoad.
  ///
  /// In en, this message translates to:
  /// **'Road-by-road route'**
  String get roadByRoad;

  /// No description provided for @road.
  ///
  /// In en, this message translates to:
  /// **'Road'**
  String get road;

  /// No description provided for @risk.
  ///
  /// In en, this message translates to:
  /// **'Risk'**
  String get risk;

  /// No description provided for @status.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get status;

  /// No description provided for @saveRouteDevice.
  ///
  /// In en, this message translates to:
  /// **'Save this route on this device'**
  String get saveRouteDevice;

  /// No description provided for @preference.
  ///
  /// In en, this message translates to:
  /// **'Preference'**
  String get preference;

  /// No description provided for @path.
  ///
  /// In en, this message translates to:
  /// **'Path'**
  String get path;

  /// No description provided for @notProvided.
  ///
  /// In en, this message translates to:
  /// **'not provided'**
  String get notProvided;

  /// No description provided for @staticNetworkNotice.
  ///
  /// In en, this message translates to:
  /// **'Routes use a static Pune road graph, not complete live navigation. Confirm road conditions with authorities before travelling.'**
  String get staticNetworkNotice;

  /// No description provided for @calculatingRoute.
  ///
  /// In en, this message translates to:
  /// **'Calculating route...'**
  String get calculatingRoute;

  /// No description provided for @currentRouteName.
  ///
  /// In en, this message translates to:
  /// **'Current location'**
  String get currentRouteName;

  /// No description provided for @reportingSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Submitting...'**
  String get reportingSubmitted;

  /// No description provided for @routePreferenceSafest.
  ///
  /// In en, this message translates to:
  /// **'Safest'**
  String get routePreferenceSafest;

  /// No description provided for @routePreferenceShortest.
  ///
  /// In en, this message translates to:
  /// **'Shortest'**
  String get routePreferenceShortest;

  /// No description provided for @routeFeasibility.
  ///
  /// In en, this message translates to:
  /// **'Route availability'**
  String get routeFeasibility;

  /// No description provided for @openDirections.
  ///
  /// In en, this message translates to:
  /// **'Open directions'**
  String get openDirections;

  /// No description provided for @safe.
  ///
  /// In en, this message translates to:
  /// **'Safe'**
  String get safe;

  /// No description provided for @locationServiceOff.
  ///
  /// In en, this message translates to:
  /// **'Location services are turned off. Enable them or choose a known map location.'**
  String get locationServiceOff;

  /// No description provided for @locationPermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Location permission was denied. You can still choose a mapped location.'**
  String get locationPermissionDenied;

  /// No description provided for @locationPermissionPermanentlyDenied.
  ///
  /// In en, this message translates to:
  /// **'Location permission is disabled for this app. Enable it in system settings or choose a mapped location.'**
  String get locationPermissionPermanentlyDenied;

  /// No description provided for @locationRequestFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not get your location: {error}'**
  String locationRequestFailed(Object error);

  /// No description provided for @moderate.
  ///
  /// In en, this message translates to:
  /// **'Moderate'**
  String get moderate;

  /// No description provided for @reportedAt.
  ///
  /// In en, this message translates to:
  /// **'Reported: {time}'**
  String reportedAt(Object time);

  /// No description provided for @reportTypeWaterlogging.
  ///
  /// In en, this message translates to:
  /// **'Waterlogging'**
  String get reportTypeWaterlogging;

  /// No description provided for @reportTypeRoadFlooded.
  ///
  /// In en, this message translates to:
  /// **'Road flooded'**
  String get reportTypeRoadFlooded;

  /// No description provided for @reportTypeRoadBlocked.
  ///
  /// In en, this message translates to:
  /// **'Road blocked'**
  String get reportTypeRoadBlocked;

  /// No description provided for @reportTypeHeavyRainfall.
  ///
  /// In en, this message translates to:
  /// **'Heavy rainfall'**
  String get reportTypeHeavyRainfall;

  /// No description provided for @reportTypeDrainageOverflow.
  ///
  /// In en, this message translates to:
  /// **'Drainage overflow'**
  String get reportTypeDrainageOverflow;

  /// No description provided for @reportTypeFallenTree.
  ///
  /// In en, this message translates to:
  /// **'Fallen tree'**
  String get reportTypeFallenTree;

  /// No description provided for @reportTypeTrafficDisruption.
  ///
  /// In en, this message translates to:
  /// **'Traffic disruption'**
  String get reportTypeTrafficDisruption;

  /// No description provided for @reportTypeRescueRequired.
  ///
  /// In en, this message translates to:
  /// **'Rescue required'**
  String get reportTypeRescueRequired;

  /// No description provided for @positionSourceGps.
  ///
  /// In en, this message translates to:
  /// **'GPS location (permission granted)'**
  String get positionSourceGps;

  /// No description provided for @positionSourceMapped.
  ///
  /// In en, this message translates to:
  /// **'Selected mapped road-network point'**
  String get positionSourceMapped;

  /// No description provided for @availableMappedLocationsNotice.
  ///
  /// In en, this message translates to:
  /// **'Mapped locations unavailable; GPS can still provide coordinates.'**
  String get availableMappedLocationsNotice;

  /// No description provided for @readSavedError.
  ///
  /// In en, this message translates to:
  /// **'Could not read saved information: {error}'**
  String readSavedError(Object error);

  /// No description provided for @removeSavedError.
  ///
  /// In en, this message translates to:
  /// **'Could not remove saved information: {error}'**
  String removeSavedError(Object error);

  /// No description provided for @savedItemsNotice.
  ///
  /// In en, this message translates to:
  /// **'Items are stored on this device and may become outdated. Confirm facility details before relying on them.'**
  String get savedItemsNotice;

  /// No description provided for @savedRecordSubtitle.
  ///
  /// In en, this message translates to:
  /// **'{type} · Saved {time}'**
  String savedRecordSubtitle(Object type, Object time);

  /// No description provided for @route.
  ///
  /// In en, this message translates to:
  /// **'Route'**
  String get route;

  /// No description provided for @assistantEmpty.
  ///
  /// In en, this message translates to:
  /// **'Ask for general app guidance or flood-safety information. This assistant does not replace emergency services.'**
  String get assistantEmpty;

  /// No description provided for @assistantSourceUnverified.
  ///
  /// In en, this message translates to:
  /// **'Service-reported source (not independently verified): {source}'**
  String assistantSourceUnverified(Object source);

  /// No description provided for @assistantUserTextNotice.
  ///
  /// In en, this message translates to:
  /// **'Messages and replies from the service are shown as received; arbitrary generated content is not translated by this app.'**
  String get assistantUserTextNotice;

  /// No description provided for @safety.
  ///
  /// In en, this message translates to:
  /// **'Safety'**
  String get safety;

  /// No description provided for @featureUnavailable.
  ///
  /// In en, this message translates to:
  /// **'This feature is unavailable.'**
  String get featureUnavailable;

  /// No description provided for @bePrepared.
  ///
  /// In en, this message translates to:
  /// **'Be prepared'**
  String get bePrepared;

  /// No description provided for @searchTitle.
  ///
  /// In en, this message translates to:
  /// **'Search resources'**
  String get searchTitle;

  /// No description provided for @searchHint.
  ///
  /// In en, this message translates to:
  /// **'Search shelters, hospitals, roads...'**
  String get searchHint;

  /// No description provided for @searchPrompt.
  ///
  /// In en, this message translates to:
  /// **'Search available shelters, hospitals, relief facilities, roads and reports.'**
  String get searchPrompt;

  /// No description provided for @searchNoResults.
  ///
  /// In en, this message translates to:
  /// **'No matching records were found.'**
  String get searchNoResults;

  /// No description provided for @searchUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Search records are unavailable right now. Check your connection and retry.'**
  String get searchUnavailable;

  /// No description provided for @searchPartialUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Some search sources are unavailable. Showing records that could be loaded.'**
  String get searchPartialUnavailable;

  /// No description provided for @searchClear.
  ///
  /// In en, this message translates to:
  /// **'Clear search'**
  String get searchClear;

  /// No description provided for @searchAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get searchAll;

  /// No description provided for @searchOpenResource.
  ///
  /// In en, this message translates to:
  /// **'Open related feature'**
  String get searchOpenResource;

  /// No description provided for @copyCoordinates.
  ///
  /// In en, this message translates to:
  /// **'Copy coordinates'**
  String get copyCoordinates;

  /// No description provided for @coordinatesCopied.
  ///
  /// In en, this message translates to:
  /// **'Coordinates copied'**
  String get coordinatesCopied;

  /// No description provided for @reportReference.
  ///
  /// In en, this message translates to:
  /// **'Report ID: {id}'**
  String reportReference(Object id);

  /// No description provided for @mapPreviewTitle.
  ///
  /// In en, this message translates to:
  /// **'Map near you'**
  String get mapPreviewTitle;

  /// No description provided for @viewFullRiskMap.
  ///
  /// In en, this message translates to:
  /// **'View Full Risk Map'**
  String get viewFullRiskMap;

  /// No description provided for @mapCurrentLocation.
  ///
  /// In en, this message translates to:
  /// **'Current GPS location'**
  String get mapCurrentLocation;

  /// No description provided for @mapUseLocation.
  ///
  /// In en, this message translates to:
  /// **'Use my location'**
  String get mapUseLocation;

  /// No description provided for @mapLocationNeeded.
  ///
  /// In en, this message translates to:
  /// **'Allow location access to see whether map data covers your area.'**
  String get mapLocationNeeded;

  /// No description provided for @mapLocationUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Your current location is unavailable.'**
  String get mapLocationUnavailable;

  /// No description provided for @mapOutsideCoverage.
  ///
  /// In en, this message translates to:
  /// **'Your location is outside the available road-network coverage. No local risk information is shown.'**
  String get mapOutsideCoverage;

  /// No description provided for @mapStaticData.
  ///
  /// In en, this message translates to:
  /// **'Static demo data'**
  String get mapStaticData;

  /// No description provided for @mapRoadNetworkSource.
  ///
  /// In en, this message translates to:
  /// **'Road network records'**
  String get mapRoadNetworkSource;

  /// No description provided for @mapStaleData.
  ///
  /// In en, this message translates to:
  /// **'Stale data'**
  String get mapStaleData;

  /// No description provided for @mapUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Map data unavailable'**
  String get mapUnavailable;

  /// No description provided for @mapRiskUnavailable.
  ///
  /// In en, this message translates to:
  /// **'No road-risk record is available for this location.'**
  String get mapRiskUnavailable;

  /// No description provided for @mapRiskContext.
  ///
  /// In en, this message translates to:
  /// **'Status is from a nearby mapped road, not an exact GPS-point reading.'**
  String get mapRiskContext;

  /// No description provided for @mapKnownHazards.
  ///
  /// In en, this message translates to:
  /// **'Nearby reported hazards'**
  String get mapKnownHazards;

  /// No description provided for @mapNoHazards.
  ///
  /// In en, this message translates to:
  /// **'No nearby hazard reports are available.'**
  String get mapNoHazards;

  /// No description provided for @mapExpandInfo.
  ///
  /// In en, this message translates to:
  /// **'Expand map details'**
  String get mapExpandInfo;

  /// No description provided for @mapCollapseInfo.
  ///
  /// In en, this message translates to:
  /// **'Show more map'**
  String get mapCollapseInfo;

  /// No description provided for @emergencyAssistance.
  ///
  /// In en, this message translates to:
  /// **'Emergency Assistance'**
  String get emergencyAssistance;

  /// No description provided for @findShelterDescription.
  ///
  /// In en, this message translates to:
  /// **'Browse available shelter and facility records'**
  String get findShelterDescription;

  /// No description provided for @reportHazard.
  ///
  /// In en, this message translates to:
  /// **'Report Hazard'**
  String get reportHazard;

  /// No description provided for @reportHazardDescription.
  ///
  /// In en, this message translates to:
  /// **'Send a hazard report for review'**
  String get reportHazardDescription;

  /// No description provided for @accountSection.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get accountSection;

  /// No description provided for @accountGuest.
  ///
  /// In en, this message translates to:
  /// **'You are using guest access.'**
  String get accountGuest;

  /// No description provided for @accountSignedIn.
  ///
  /// In en, this message translates to:
  /// **'You are signed in.'**
  String get accountSignedIn;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>[
    'en',
    'gu',
    'hi',
    'mr',
    'ta',
    'te',
  ].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'gu':
      return AppLocalizationsGu();
    case 'hi':
      return AppLocalizationsHi();
    case 'mr':
      return AppLocalizationsMr();
    case 'ta':
      return AppLocalizationsTa();
    case 'te':
      return AppLocalizationsTe();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
