// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'SankatSetu';

  @override
  String get apiNetworkError =>
      'The app could not connect to the server. Check your connection and try again.';

  @override
  String get apiTimeout =>
      'The server request timed out. Check your connection and retry.';

  @override
  String get apiInvalidResponse =>
      'The server returned data the app could not read.';

  @override
  String get language => 'Language';

  @override
  String get settings => 'Settings';

  @override
  String get currentLanguage => 'Current language';

  @override
  String get english => 'English';

  @override
  String get hindi => 'हिन्दी';

  @override
  String get marathi => 'मराठी';

  @override
  String get gujarati => 'ગુજરાતી';

  @override
  String get tamil => 'தமிழ்';

  @override
  String get telugu => 'తెలుగు';

  @override
  String get welcome => 'Your safety, our priority';

  @override
  String get welcomeTitle => 'Welcome to SankatSetu';

  @override
  String get welcomeDescription =>
      'Emergency guidance and essential safety features are available without an account.';

  @override
  String get continueAsGuest => 'Continue as Guest';

  @override
  String get login => 'Login';

  @override
  String get signIn => 'Sign in';

  @override
  String get signUp => 'Sign Up';

  @override
  String get createAccount => 'Create Account / Sign Up';

  @override
  String get createYourAccount => 'Create your account';

  @override
  String get signUpDescription => 'Sign up for a SankatSetu citizen account.';

  @override
  String get signInDescription =>
      'Sign in to continue to your safety dashboard.';

  @override
  String get fullName => 'Full Name';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get confirmPassword => 'Confirm Password';

  @override
  String get phoneOptional => 'Phone (optional)';

  @override
  String get showPassword => 'Show password';

  @override
  String get hidePassword => 'Hide password';

  @override
  String get showConfirmPassword => 'Show confirm password';

  @override
  String get hideConfirmPassword => 'Hide confirm password';

  @override
  String get enterFullName => 'Enter your full name.';

  @override
  String get enterEmail => 'Enter your email address.';

  @override
  String get validEmail => 'Enter a valid email address.';

  @override
  String get enterPassword => 'Enter your password.';

  @override
  String get passwordMinLength => 'Password must be at least 6 characters.';

  @override
  String get confirmYourPassword => 'Confirm your password.';

  @override
  String get passwordsMismatch => 'Passwords do not match.';

  @override
  String get alreadyHaveAccount => 'Already have an account? Login';

  @override
  String get newToApp => 'New to SankatSetu? Sign Up';

  @override
  String get backToWelcome => 'Back to welcome options';

  @override
  String get home => 'Home';

  @override
  String get homeRegion => 'Pune, Maharashtra';

  @override
  String get map => 'Risk Map';

  @override
  String get reports => 'Reports';

  @override
  String get emergency => 'Emergency';

  @override
  String get safeRoutes => 'Safe Route Planner';

  @override
  String get alerts => 'Disaster Alerts';

  @override
  String get offlineGuide => 'Preparedness Guide';

  @override
  String get assistant => 'Emergency Assistant';

  @override
  String get savedInfo => 'Saved Information';

  @override
  String get logout => 'Sign out';

  @override
  String get signOutGuest => 'Sign out of guest mode';

  @override
  String get guestAccessActive =>
      'Guest access is active. Emergency and safety features are available without an account.';

  @override
  String get signedInNotice =>
      'Signed in as a citizen. Report submission uses your server-issued account token.';

  @override
  String get floodRiskUpdates => 'Flood risk updates';

  @override
  String get liveRiskUnavailable =>
      'Live flood-risk monitoring is not available yet. Check official alerts before travelling.';

  @override
  String get emergencyActions => 'Emergency actions';

  @override
  String get findEmergencyHelp => 'Find emergency help and nearby facilities';

  @override
  String get compareRoutes => 'Compare safer routes and avoid flooded roads';

  @override
  String get reportWaterlogging => 'Report waterlogging or blocked roads';

  @override
  String get moreTools => 'More tools';

  @override
  String get keepSuppliesReady =>
      'Keep essential supplies and emergency contacts ready.';

  @override
  String get currentRisk => 'Road status from backend data';

  @override
  String get demoData =>
      'Road and incident data may include seeded demo records.';

  @override
  String get loading => 'Loading...';

  @override
  String get retry => 'Retry';

  @override
  String get save => 'Save';

  @override
  String get connected => 'Backend reachable';

  @override
  String get offline =>
      'Backend unavailable — offline guidance remains available';

  @override
  String get notDispatch => 'This app does not contact emergency dispatch.';

  @override
  String get sosCall => 'SOS · Open dialer for 101';

  @override
  String get callYourselfNotice =>
      'The app cannot send your location or contact a rescue team. You must place the call yourself.';

  @override
  String get gettingLocation => 'Getting location...';

  @override
  String get showMyLocation => 'Show my location';

  @override
  String yourLocation(Object location) {
    return 'Your location: $location';
  }

  @override
  String get alertsInAppOnly => 'In-app advisories only';

  @override
  String get alertsNoPushNotice =>
      'Push notifications are not configured. This screen does not run as an emergency alert service.';

  @override
  String get alertsDataNotice =>
      'There is no dedicated alerts or push-notification service. These in-app advisories come from road and report records and may include demo data.';

  @override
  String get followAuthorities =>
      'Follow instructions from local authorities and official emergency services.';

  @override
  String get evacuateWhenTold =>
      'Evacuate promptly when authorities instruct you to do so. Use a route confirmed safe by authorities; do not rely on an app route alone.';

  @override
  String get neverEnterFloodwater =>
      'Never walk, swim or drive through floodwater. Depth, current, open drains and road damage may be hidden.';

  @override
  String get avoidPowerLines =>
      'Stay away from fallen power lines and electrical equipment in or near water. Do not touch wet switches.';

  @override
  String get safeWater =>
      'Drink sealed or treated water. Avoid water that may be contaminated by floodwater.';

  @override
  String get returnOnlyWhenSafe =>
      'Return only when authorities say it is safe. Flooded buildings may have structural, electrical or gas hazards.';

  @override
  String get reportDontInvestigate =>
      'Keep away from standing water, damaged bridges and fallen wires. Report hazards; do not approach to investigate.';

  @override
  String get emergencyGuidanceDisclaimer =>
      'This guidance is not a live alert or a substitute for emergency services and local authority instructions.';

  @override
  String get before => 'Before a flood';

  @override
  String get during => 'During a flood';

  @override
  String get after => 'After a flood';

  @override
  String get safeRouteTitle => 'Safe Route Planner';

  @override
  String get findSaferWay => 'Find a Safer Way';

  @override
  String get routeIntro =>
      'Plan your journey while avoiding potentially flooded areas.';

  @override
  String get useCurrentLocation => 'Use My Current Location';

  @override
  String get destination => 'Destination';

  @override
  String get selectDestination => 'Select destination';

  @override
  String get routePreference => 'Route Preference';

  @override
  String get safestRoute => 'Safest Route';

  @override
  String get shortestRoute => 'Shortest Route';

  @override
  String get routeMap => 'Route Map';

  @override
  String get findSafeRoute => 'Find Safe Route';

  @override
  String get routeSafetyNotice =>
      'Safety Notice\nAvoid waterlogged roads and never cross flowing floodwater. Follow official emergency instructions. Route results use available road-network data and are not a substitute for official emergency guidance.';

  @override
  String get routeNotLiveNavigation =>
      'The road network is a demo map, not live navigation. Confirm conditions and route safety with local authorities.';

  @override
  String get floodRiskMap => 'Flood risk map';

  @override
  String get refreshMapData => 'Refresh map data';

  @override
  String get lowRisk => 'Low risk';

  @override
  String get mediumRisk => 'Medium risk';

  @override
  String get highRisk => 'High risk';

  @override
  String get blockedRoad => 'Blocked road';

  @override
  String get communityReport => 'Community report';

  @override
  String get communityIncidents => 'Community incidents';

  @override
  String get reportIncident => 'Report incident';

  @override
  String get reportFormTitle => 'Report an incident';

  @override
  String get currentLocation => 'Current location';

  @override
  String get signInToReport => 'Sign in to submit a report';

  @override
  String get publicReportFeed =>
      'Viewing reports is public; submitting requires a citizen account.';

  @override
  String get noIncidentReports => 'No incident reports are available.';

  @override
  String get reportSubmitted => 'Report submitted';

  @override
  String reportUnverified(Object status) {
    return 'The server recorded this report as \"$status\". It has not been verified by an authority.';
  }

  @override
  String get done => 'Done';

  @override
  String get incidentType => 'Incident type';

  @override
  String get severity => 'Severity reported by you';

  @override
  String get locationName => 'Location name';

  @override
  String get mappedLocationHint => 'Area or mapped location';

  @override
  String get description => 'Description';

  @override
  String get hazardDescriptionHint =>
      'Describe the hazard or assistance needed';

  @override
  String get chooseMappedPoint => 'Choose a mapped point (optional)';

  @override
  String get selectKnownPoint => 'Select a known map point';

  @override
  String get relatedRoad => 'Related road (optional)';

  @override
  String get noSpecificRoad => 'No specific road';

  @override
  String get useGpsLocation => 'Use current GPS location';

  @override
  String get submitting => 'Submitting...';

  @override
  String get submitReport => 'Submit report';

  @override
  String get enterLocationName => 'Enter a location name.';

  @override
  String get describeIncident => 'Describe what happened.';

  @override
  String get chooseAccurateLocation =>
      'Choose a mapped location or grant location permission. A text-only location cannot be accurately placed on the incident map.';

  @override
  String get emergencyAssistant => 'Emergency assistant';

  @override
  String assistantResponseLanguage(Object language) {
    return 'Response language: $language';
  }

  @override
  String get assistantSafetyNotice =>
      'Replies come from the backend chatbot and may be incomplete. They are not verified emergency guidance and do not confirm live conditions, facility availability, route safety or dispatch.';

  @override
  String get askFloodSafety => 'Ask a flood-safety question';

  @override
  String get sendMessage => 'Send message';

  @override
  String get assistantUnavailable =>
      'The assistant service is unavailable. Use the offline emergency guide for basic safety steps. For immediate danger, contact local emergency services directly. This app cannot confirm live conditions or route safety.';

  @override
  String get assistantQuestionEvacuation =>
      'When should I evacuate during a flood?';

  @override
  String get assistantQuestionFloodwater => 'Why should I avoid floodwater?';

  @override
  String get assistantQuestionSupplies =>
      'What should I pack in an emergency kit?';

  @override
  String get savedInformation => 'Saved information';

  @override
  String get noSavedItems =>
      'No saved items yet. Save a route or an emergency facility to keep it on this device.';

  @override
  String get removeSavedItem => 'Remove saved item';

  @override
  String get retryAction => 'Retry';

  @override
  String get backendRecordsNotice =>
      'Backend records can include seeded demo data and may not reflect live conditions.';

  @override
  String get updateTimeNotProvided => 'Update time not provided';

  @override
  String get high => 'High';

  @override
  String get medium => 'Medium';

  @override
  String get low => 'Low';

  @override
  String get unknown => 'Unknown';

  @override
  String saveLanguageError(Object error) {
    return 'Could not save language preference: $error';
  }

  @override
  String startupRestoreError(Object error) {
    return 'Could not restore saved app settings: $error';
  }

  @override
  String get sessionVerifyOffline =>
      'Could not verify your saved sign-in. Continuing with the saved session while offline.';

  @override
  String signOutError(Object error) {
    return 'Could not sign out safely: $error';
  }

  @override
  String saveGuestError(Object error) {
    return 'Could not save guest session: $error';
  }

  @override
  String get settingsTitle => 'Profile and Settings';

  @override
  String get languageUpdated => 'Language updated';

  @override
  String get roadRiskAdvisory => 'Road risk advisory';

  @override
  String get roadReportedBlocked => 'Road reported blocked';

  @override
  String get criticalWaterlogging => 'Critical waterlogging status';

  @override
  String get source => 'Source';

  @override
  String get updated => 'Updated';

  @override
  String get reviewStatus => 'Review status';

  @override
  String get availableOffline => 'Available offline';

  @override
  String get emergencyKit => 'Emergency kit';

  @override
  String get guidanceBundled =>
      'Guidance is bundled with the app; no network is needed.';

  @override
  String get guideBefore => 'Before flooding';

  @override
  String get guideDuring => 'During flooding';

  @override
  String get guideAfter => 'After flooding';

  @override
  String get guideInclusive => 'Inclusive assistance';

  @override
  String get readOfficialInstructions => 'Read official instructions';

  @override
  String get fireRescue => 'Fire and Rescue';

  @override
  String dialerOpened(Object name) {
    return 'Phone dialer opened for $name. This app did not send an SOS or dispatch message.';
  }

  @override
  String noDialableNumber(Object name) {
    return 'No dialable number is provided for $name.';
  }

  @override
  String dialerUnavailable(Object name) {
    return 'This device could not open a phone dialer for $name.';
  }

  @override
  String dialerError(Object error) {
    return 'Could not open the phone dialer: $error';
  }

  @override
  String get openMap => 'Open map';

  @override
  String get noMapApp => 'No map application could open this location.';

  @override
  String mapAppError(Object error) {
    return 'Could not open a map application: $error';
  }

  @override
  String savedOnDevice(Object name) {
    return '$name saved on this device.';
  }

  @override
  String saveInformationError(Object error) {
    return 'Could not save this information: $error';
  }

  @override
  String get emergencyFacilities => 'Emergency facilities';

  @override
  String get hospitals => 'Hospitals';

  @override
  String get shelters => 'Shelters';

  @override
  String get noFacilityRecords => 'No emergency facility records returned.';

  @override
  String get noHospitalRecords => 'No hospital records returned.';

  @override
  String get noShelterRecords => 'No shelter records returned.';

  @override
  String get facilityDataNotice =>
      'Emergency facility and capacity details come from backend records and may be seeded or outdated. Confirm directly with the facility before travelling.';

  @override
  String get beds => 'Beds';

  @override
  String get icu => 'ICU';

  @override
  String get traumaCenterListed =>
      'The backend lists a trauma center. Availability is not confirmed live.';

  @override
  String get traumaCenterNotListed =>
      'No trauma center is listed by the backend.';

  @override
  String get petFriendly => 'Pet-friendly';

  @override
  String get wheelchairAccessible => 'Wheelchair accessible';

  @override
  String get listed => 'listed';

  @override
  String get notListed => 'not listed';

  @override
  String get contact => 'Contact';

  @override
  String get coordinates => 'Coordinates';

  @override
  String get openRouteMap => 'Open route map';

  @override
  String get errorGeneric => 'Something went wrong. Please try again.';

  @override
  String get networkUnavailable => 'The requested data is unavailable.';

  @override
  String get mapTilesUnavailable =>
      'Map tiles are unavailable. Road and incident data are shown from the backend; the base map needs internet access.';

  @override
  String get noRoadNetwork => 'Road network data is unavailable.';

  @override
  String get refreshReports => 'Refresh reports';

  @override
  String get reportsDataNotice =>
      'Reports are server records and may include seeded demo entries. Citizen submissions remain unverified until reviewed by an authority.';

  @override
  String get reportingDataNotice =>
      'Reports are sent to the backend for review. The app cannot dispatch rescue services, and this API does not accept image uploads.';

  @override
  String get mappedLocationsUnavailable =>
      'Mapped locations are unavailable; GPS can still provide coordinates.';

  @override
  String get positionSource => 'Position source';

  @override
  String get gpsPermissionGranted => 'GPS location (permission granted)';

  @override
  String get selectedMappedPoint => 'Selected mapped road-network point';

  @override
  String get reporting => 'Report';

  @override
  String get locationUnavailable => 'Location unavailable';

  @override
  String get getRouteError => 'Unable to calculate route.';

  @override
  String get routeNotFound => 'No feasible route found.';

  @override
  String get noFeasibleRoute => 'No feasible route available.';

  @override
  String get differentRoutePoints =>
      'Starting point and destination must be different.';

  @override
  String saveRouteError(Object error) {
    return 'Could not save this route: $error';
  }

  @override
  String get routeSaved => 'Route saved on this device.';

  @override
  String get startingPoint => 'Starting point';

  @override
  String get selectStartingPoint => 'Select starting point';

  @override
  String get gettingCurrentLocation => 'Getting current location...';

  @override
  String get gpsNotAvailable => 'GPS location is unavailable.';

  @override
  String get nearestRoadNodeUnavailable =>
      'No road-network nodes are available to use as a starting point.';

  @override
  String outsideRoadNetwork(Object node, Object distance, Object maximum) {
    return 'Outside the available Pune road network: the nearest node, $node, is $distance km away (maximum $maximum km). No starting node was selected.';
  }

  @override
  String detectedGpsLocation(Object location) {
    return 'Detected GPS location: $location.';
  }

  @override
  String selectedStartingNode(Object node, Object distance) {
    return 'Selected starting node: $node ($distance km away).';
  }

  @override
  String get noAlerts =>
      'No road-risk advisories or open reports were returned by the backend.';

  @override
  String get critical => 'Critical';

  @override
  String get roadNetwork => 'Road network';

  @override
  String get backendStatus => 'Backend status';

  @override
  String get riskScore => 'Risk score';

  @override
  String get caution => 'Caution';

  @override
  String get clear => 'Clear';

  @override
  String get verified => 'Verified';

  @override
  String get rejected => 'Rejected';

  @override
  String get resolved => 'Resolved';

  @override
  String get underReview => 'Under Review';

  @override
  String get refresh => 'Refresh';

  @override
  String get lowRiskLegend => 'Low risk';

  @override
  String get mediumRiskLegend => 'Medium risk';

  @override
  String get highRiskLegend => 'High / blocked';

  @override
  String get roadNode => 'Road node';

  @override
  String get communityReportLegend => 'Community report';

  @override
  String get mapTilesError =>
      'Map tiles are unavailable. Road and incident data are shown from the backend; the base map needs internet access.';

  @override
  String loadingLocations(Object baseUrl) {
    return 'Loading locations from $baseUrl...';
  }

  @override
  String get noRoadLocations => 'No road locations are currently available.';

  @override
  String get retryLoadingLocations => 'Retry loading locations';

  @override
  String get routeTilesUnavailable =>
      'Map tiles are unavailable. Route calculation still uses backend road-graph data.';

  @override
  String routeDetails(Object route) {
    return '$route route details';
  }

  @override
  String get blockedRouteWarning =>
      'Warning: this route includes a road marked blocked. Do not travel this route; follow current local authority guidance.';

  @override
  String get distance => 'Distance';

  @override
  String get estimatedTime => 'Estimated time';

  @override
  String get averageRisk => 'Average risk';

  @override
  String get maximumRisk => 'Maximum risk';

  @override
  String get safetyRating => 'Safety rating';

  @override
  String get roadByRoad => 'Road-by-road route';

  @override
  String get road => 'Road';

  @override
  String get risk => 'Risk';

  @override
  String get status => 'Status';

  @override
  String get saveRouteDevice => 'Save this route on this device';

  @override
  String get preference => 'Preference';

  @override
  String get path => 'Path';

  @override
  String get notProvided => 'not provided';

  @override
  String get staticNetworkNotice =>
      'Routes use a static Pune road graph, not complete live navigation. Confirm road conditions with authorities before travelling.';

  @override
  String get calculatingRoute => 'Calculating route...';

  @override
  String get currentRouteName => 'Current location';

  @override
  String get reportingSubmitted => 'Submitting...';

  @override
  String get routePreferenceSafest => 'Safest';

  @override
  String get routePreferenceShortest => 'Shortest';

  @override
  String get routeFeasibility => 'Route availability';

  @override
  String get openDirections => 'Open directions';

  @override
  String get safe => 'Safe';

  @override
  String get locationServiceOff =>
      'Location services are turned off. Enable them or choose a known map location.';

  @override
  String get locationPermissionDenied =>
      'Location permission was denied. You can still choose a mapped location.';

  @override
  String get locationPermissionPermanentlyDenied =>
      'Location permission is disabled for this app. Enable it in system settings or choose a mapped location.';

  @override
  String locationRequestFailed(Object error) {
    return 'Could not get your location: $error';
  }

  @override
  String get moderate => 'Moderate';

  @override
  String reportedAt(Object time) {
    return 'Reported: $time';
  }

  @override
  String get reportTypeWaterlogging => 'Waterlogging';

  @override
  String get reportTypeRoadFlooded => 'Road flooded';

  @override
  String get reportTypeRoadBlocked => 'Road blocked';

  @override
  String get reportTypeHeavyRainfall => 'Heavy rainfall';

  @override
  String get reportTypeDrainageOverflow => 'Drainage overflow';

  @override
  String get reportTypeFallenTree => 'Fallen tree';

  @override
  String get reportTypeTrafficDisruption => 'Traffic disruption';

  @override
  String get reportTypeRescueRequired => 'Rescue required';

  @override
  String get positionSourceGps => 'GPS location (permission granted)';

  @override
  String get positionSourceMapped => 'Selected mapped road-network point';

  @override
  String get availableMappedLocationsNotice =>
      'Mapped locations unavailable; GPS can still provide coordinates.';

  @override
  String readSavedError(Object error) {
    return 'Could not read saved information: $error';
  }

  @override
  String removeSavedError(Object error) {
    return 'Could not remove saved information: $error';
  }

  @override
  String get savedItemsNotice =>
      'Items are stored on this device and may become outdated. Confirm facility details before relying on them.';

  @override
  String savedRecordSubtitle(Object type, Object time) {
    return '$type · Saved $time';
  }

  @override
  String get route => 'Route';

  @override
  String get assistantEmpty =>
      'Ask for general app guidance or flood-safety information. This assistant does not replace emergency services.';

  @override
  String assistantSourceUnverified(Object source) {
    return 'Service-reported source (not independently verified): $source';
  }

  @override
  String get assistantUserTextNotice =>
      'Messages and replies from the service are shown as received; arbitrary generated content is not translated by this app.';

  @override
  String get safety => 'Safety';

  @override
  String get featureUnavailable => 'This feature is unavailable.';

  @override
  String get bePrepared => 'Be prepared';

  @override
  String get searchTitle => 'Search resources';

  @override
  String get searchHint => 'Search shelters, hospitals, roads...';

  @override
  String get searchPrompt =>
      'Search available shelters, hospitals, relief facilities, roads and reports.';

  @override
  String get searchNoResults => 'No matching records were found.';

  @override
  String get searchUnavailable =>
      'Search records are unavailable right now. Check your connection and retry.';

  @override
  String get searchPartialUnavailable =>
      'Some search sources are unavailable. Showing records that could be loaded.';

  @override
  String get searchClear => 'Clear search';

  @override
  String get searchAll => 'All';

  @override
  String get searchOpenResource => 'Open related feature';

  @override
  String get copyCoordinates => 'Copy coordinates';

  @override
  String get coordinatesCopied => 'Coordinates copied';

  @override
  String reportReference(Object id) {
    return 'Report ID: $id';
  }

  @override
  String get mapPreviewTitle => 'Map near you';

  @override
  String get viewFullRiskMap => 'View Full Risk Map';

  @override
  String get mapCurrentLocation => 'Current GPS location';

  @override
  String get mapUseLocation => 'Use my location';

  @override
  String get mapLocationNeeded =>
      'Allow location access to see whether map data covers your area.';

  @override
  String get mapLocationUnavailable => 'Your current location is unavailable.';

  @override
  String get mapOutsideCoverage =>
      'Your location is outside the available road-network coverage. No local risk information is shown.';

  @override
  String get mapStaticData => 'Static demo data';

  @override
  String get mapRoadNetworkSource => 'Road network records';

  @override
  String get mapStaleData => 'Stale data';

  @override
  String get mapUnavailable => 'Map data unavailable';

  @override
  String get mapRiskUnavailable =>
      'No road-risk record is available for this location.';

  @override
  String get mapRiskContext =>
      'Status is from a nearby mapped road, not an exact GPS-point reading.';

  @override
  String get mapKnownHazards => 'Nearby reported hazards';

  @override
  String get mapNoHazards => 'No nearby hazard reports are available.';

  @override
  String get mapExpandInfo => 'Expand map details';

  @override
  String get mapCollapseInfo => 'Show more map';

  @override
  String get emergencyAssistance => 'Emergency Assistance';

  @override
  String get findShelterDescription =>
      'Browse available shelter and facility records';

  @override
  String get reportHazard => 'Report Hazard';

  @override
  String get reportHazardDescription => 'Send a hazard report for review';

  @override
  String get accountSection => 'Account';

  @override
  String get accountGuest => 'You are using guest access.';

  @override
  String get accountSignedIn => 'You are signed in.';
}
