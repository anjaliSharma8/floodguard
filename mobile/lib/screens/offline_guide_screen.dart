import 'package:material_ui/material_ui.dart';

import '../app_text.dart';
import '../widgets/app_widgets.dart';

class OfflineGuideScreen extends StatelessWidget {
  const OfflineGuideScreen({required this.language, super.key});

  final String language;

  static const Map<String, Map<String, Object>> _content = {
    'en': {
      'before': [
        'Follow official weather and local authority announcements; this guide is not a live alert feed.',
        'Keep drinking water, essential medicines, a torch, batteries, phone power bank, copies of key documents and basic first-aid supplies in a waterproof bag.',
        'Know how household members will contact one another and identify an accessible place to go if authorities advise evacuation.',
        'Move valuables and electrical appliances above likely water levels when it is safe to do so.',
        'Plan support for children, older adults, people with disabilities, medical needs and pets before an emergency.',
      ],
      'during': [
        'Follow evacuation instructions from local authorities. Leave early when told; use a route confirmed safe by authorities, not an app route alone.',
        'Never walk, swim or drive through floodwater. Water depth, current, open drains and damaged roads can be hidden.',
        'If water is entering the building, move to a safer higher level when possible and contact local emergency services.',
        'Avoid downed power lines and electrical equipment in or near water. Do not touch wet switches; turn off power only if you can do so from a dry, safe location.',
        'Keep children away from floodwater. Use sealed or treated drinking water; avoid water that may be contaminated.',
        'Keep your phone charged and share your location with trusted people when communications work.',
      ],
      'after': [
        'Return only when authorities say it is safe. Flooded buildings may have structural, electrical or gas hazards.',
        'Avoid standing water, damaged bridges and fallen wires. Report hazards to local authorities; do not approach to investigate.',
        'Use safe or boiled/treated water until local authorities confirm the supply is safe. Discard food touched by floodwater.',
        'Wear protective footwear and gloves when cleanup is authorized. Photograph damage only from a safe place.',
        'Check on neighbours who may need assistance without entering unsafe areas; seek medical care for injuries or illness.',
      ],
      'inclusive': [
        'Arrange a trusted helper, accessible transport, essential medicines, mobility aids and backup power for medical devices in advance.',
        'Keep children with a responsible adult and carry identification/contact details.',
        'Take pets only to a facility whose pet policy has been confirmed directly; this app cannot confirm current shelter capacity or access.',
      ],
      'kit': 'Water and safe food · medicines · torch and batteries · first-aid items · power bank · hygiene supplies · important documents in a sealed bag · essential contact numbers.',
      'warning': 'This guidance is stored in the app and remains available offline. It does not replace instructions from emergency services or local authorities.',
    },
    'hi': {
      'before': [
        'आधिकारिक मौसम और स्थानीय प्रशासन की घोषणाएँ देखें; यह मार्गदर्शिका लाइव चेतावनी सेवा नहीं है।',
        'पीने का पानी, आवश्यक दवाएँ, टॉर्च, बैटरियाँ, पावर बैंक, जरूरी दस्तावेज़ों की प्रतियाँ और प्राथमिक उपचार सामग्री जलरोधी बैग में रखें।',
        'परिवार के संपर्क की योजना बनाएँ और निकासी का निर्देश मिलने पर जाने के लिए सुलभ सुरक्षित स्थान पहचानें।',
        'सुरक्षित होने पर जरूरी सामान और बिजली के उपकरण संभावित जल-स्तर से ऊपर रखें।',
        'बच्चों, बुजुर्गों, दिव्यांग लोगों, चिकित्सा जरूरतों और पालतू पशुओं के लिए पहले से सहायता की योजना बनाएँ।',
      ],
      'during': [
        'स्थानीय प्रशासन के निकासी निर्देशों का पालन करें। केवल ऐप के मार्ग पर निर्भर न रहें; प्रशासन से सुरक्षित मार्ग की पुष्टि करें।',
        'बाढ़ के पानी में पैदल न चलें, तैरें नहीं और वाहन न चलाएँ। गहराई, तेज बहाव, खुले नाले और सड़क की क्षति दिखाई नहीं दे सकती।',
        'यदि घर में पानी आए तो संभव हो तो ऊँचे सुरक्षित स्थान पर जाएँ और स्थानीय आपात सेवाओं से संपर्क करें।',
        'गिरे हुए बिजली के तारों और पानी के पास बिजली के उपकरणों से दूर रहें। गीले स्विच न छुएँ; बिजली केवल सूखी सुरक्षित जगह से बंद करें।',
        'बच्चों को बाढ़ के पानी से दूर रखें। सीलबंद या उपचारित पानी पिएँ; दूषित हो सकने वाला पानी न पिएँ।',
        'फोन चार्ज रखें और संचार उपलब्ध हो तो विश्वसनीय लोगों से स्थान साझा करें।',
      ],
      'after': [
        'प्रशासन की अनुमति के बाद ही लौटें। इमारतों में संरचनात्मक, बिजली या गैस का खतरा हो सकता है।',
        'ठहरे पानी, क्षतिग्रस्त पुलों और गिरे तारों से दूर रहें। खतरे की सूचना दें; जाँचने के लिए पास न जाएँ।',
        'स्थानीय पुष्टि तक सुरक्षित या उबला/उपचारित पानी इस्तेमाल करें। बाढ़ के पानी से छुए भोजन को फेंक दें।',
        'सफाई की अनुमति के बाद दस्ताने और सुरक्षा जूते पहनें। नुकसान की तस्वीर केवल सुरक्षित जगह से लें।',
        'असुरक्षित स्थान में प्रवेश किए बिना जरूरतमंद पड़ोसियों की खबर लें; चोट या बीमारी पर चिकित्सा सहायता लें।',
      ],
      'inclusive': [
        'विश्वसनीय सहायक, सुलभ परिवहन, आवश्यक दवाएँ, चलने के उपकरण और चिकित्सा उपकरणों की बैकअप बिजली पहले से तय करें।',
        'बच्चों को जिम्मेदार वयस्क के साथ रखें और पहचान/संपर्क विवरण साथ रखें।',
        'पालतू पशुओं को तभी ले जाएँ जब सुविधा की नीति सीधे पुष्टि हो; ऐप क्षमता या पहुँच की वर्तमान पुष्टि नहीं कर सकता।',
      ],
      'kit': 'पानी और सुरक्षित भोजन · दवाएँ · टॉर्च और बैटरियाँ · प्राथमिक उपचार · पावर बैंक · स्वच्छता सामग्री · सीलबंद जरूरी दस्तावेज़ · आपात संपर्क नंबर।',
      'warning': 'यह मार्गदर्शन ऐप में सहेजा गया है और ऑफलाइन उपलब्ध रहता है। यह आपात सेवाओं या स्थानीय प्रशासन के निर्देशों का विकल्प नहीं है।',
    },
    'mr': {
      'before': [
        'अधिकृत हवामान व स्थानिक प्रशासनाच्या सूचना पाहा; हे मार्गदर्शक थेट सूचना सेवा नाही.',
        'पिण्याचे पाणी, आवश्यक औषधे, टॉर्च, बॅटऱ्या, पॉवर बँक, महत्त्वाच्या कागदपत्रांच्या प्रती आणि प्राथमिक उपचार साहित्य जलरोधक पिशवीत ठेवा.',
        'कुटुंबीयांशी संपर्काची योजना करा आणि स्थलांतर सांगितल्यास जाण्यासाठी सुलभ सुरक्षित ठिकाण ठरवा.',
        'सुरक्षित असल्यास आवश्यक वस्तू आणि विद्युत उपकरणे संभाव्य पाण्याच्या पातळीपेक्षा वर ठेवा.',
        'मुले, ज्येष्ठ नागरिक, दिव्यांग व्यक्ती, वैद्यकीय गरजा आणि पाळीव प्राण्यांसाठी आधीच मदतीची योजना करा.',
      ],
      'during': [
        'स्थानिक प्रशासनाच्या स्थलांतर सूचनांचे पालन करा. केवळ अॅपच्या मार्गावर विसंबू नका; अधिकाऱ्यांकडून सुरक्षित मार्गाची खात्री करा.',
        'पुराच्या पाण्यात चालू नका, पोहू नका किंवा वाहन चालवू नका. खोली, प्रवाह, उघडे नाले आणि रस्त्याचे नुकसान दिसणार नाही.',
        'घरात पाणी येत असल्यास शक्य असल्यास उंच सुरक्षित ठिकाणी जा आणि स्थानिक आपत्कालीन सेवांशी संपर्क साधा.',
        'तुटलेल्या वीजतारा आणि पाण्याजवळील विद्युत उपकरणांपासून दूर राहा. ओले स्विच हाताळू नका; कोरड्या सुरक्षित जागेतूनच वीज बंद करा.',
        'मुलांना पुराच्या पाण्यापासून दूर ठेवा. सीलबंद किंवा शुद्ध केलेले पाणी प्या; दूषित असू शकणारे पाणी टाळा.',
        'फोन चार्ज ठेवा आणि संपर्क उपलब्ध असल्यास विश्वासू व्यक्तींशी स्थान शेअर करा.',
      ],
      'after': [
        'प्रशासन सुरक्षित सांगितल्यावरच परत जा. इमारतींमध्ये संरचनात्मक, विद्युत किंवा गॅसचा धोका असू शकतो.',
        'साचलेले पाणी, खराब पूल आणि तुटलेल्या तारांपासून दूर राहा. धोका कळवा; तपासण्यासाठी जवळ जाऊ नका.',
        'स्थानिक प्रशासनाने सुरक्षित सांगितेपर्यंत सुरक्षित किंवा उकळलेले/शुद्ध पाणी वापरा. पुराच्या पाण्याला लागलेले अन्न टाका.',
        'स्वच्छतेची परवानगी मिळाल्यावर हातमोजे आणि सुरक्षित पादत्राणे वापरा. नुकसानाचे फोटो फक्त सुरक्षित ठिकाणाहून घ्या.',
        'असुरक्षित भागात न जाता मदतीची गरज असलेल्या शेजाऱ्यांची चौकशी करा; दुखापत किंवा आजारासाठी वैद्यकीय मदत घ्या.',
      ],
      'inclusive': [
        'विश्वासू मदतनीस, सुलभ वाहतूक, आवश्यक औषधे, हालचालीची साधने आणि वैद्यकीय उपकरणांसाठी पर्यायी वीज आधी ठरवा.',
        'मुलांना जबाबदार प्रौढ व्यक्तीसोबत ठेवा आणि ओळख/संपर्क माहिती जवळ ठेवा.',
        'पाळीव प्राण्यांना फक्त सुविधेची धोरणे थेट निश्चित केल्यावरच घेऊन जा; अॅप सध्याची क्षमता किंवा प्रवेश निश्चित करत नाही.',
      ],
      'kit': 'पाणी व सुरक्षित अन्न · औषधे · टॉर्च व बॅटऱ्या · प्राथमिक उपचार · पॉवर बँक · स्वच्छता साहित्य · सीलबंद महत्त्वाची कागदपत्रे · आपत्कालीन संपर्क क्रमांक.',
      'warning': 'हे मार्गदर्शन अॅपमध्ये साठवलेले असून ऑफलाइन उपलब्ध आहे. ते आपत्कालीन सेवा किंवा स्थानिक प्रशासनाच्या सूचनांचा पर्याय नाही.',
    },
  };

  @override
  Widget build(BuildContext context) {
    final strings = _content[language] ?? _content['en']!;
    String phrase(String key) => AppText.text(language, key);
    final sections = <(String, IconData, List<String>)>[
      (
        phrase('before'),
        Icons.wb_sunny_outlined,
        strings['before']! as List<String>,
      ),
      (
        phrase('during'),
        Icons.flood_outlined,
        strings['during']! as List<String>,
      ),
      (
        phrase('after'),
        Icons.home_repair_service_outlined,
        strings['after']! as List<String>,
      ),
      (
        language == 'hi'
            ? 'विशेष सहायता'
            : language == 'mr'
            ? 'समावेशक मदत'
            : 'Inclusive assistance',
        Icons.accessible_forward,
        strings['inclusive']! as List<String>,
      ),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(phrase('offlineGuide'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: Colors.green.shade50,
            child: const ListTile(
              leading: Icon(Icons.offline_pin, color: Colors.green),
              title: Text('Available offline'),
              subtitle: Text(
                'Guidance is bundled with the app; no network is needed.',
              ),
            ),
          ),
          const SizedBox(height: 8),
          DemoDataNotice(text: strings['warning']! as String),
          const SizedBox(height: 12),
          for (final (title, icon, items) in sections)
            Card(
              child: ExpansionTile(
                leading: Icon(icon, color: sankatPrimary),
                title: Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                initiallyExpanded: title == phrase('during'),
                children: [
                  for (final item in items)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 3, 18, 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('•  '),
                          Expanded(child: Text(item)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          Card(
            child: ListTile(
              leading: const Icon(
                Icons.backpack_outlined,
                color: sankatPrimary,
              ),
              title: Text(
                language == 'hi'
                    ? 'आपातकालीन किट'
                    : language == 'mr'
                    ? 'आपत्कालीन संच'
                    : 'Emergency kit',
              ),
              subtitle: Text(strings['kit']! as String),
            ),
          ),
        ],
      ),
    );
  }
}
