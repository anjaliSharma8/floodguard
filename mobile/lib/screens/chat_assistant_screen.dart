import 'package:material_ui/material_ui.dart';

import '../l10n/generated/app_localizations.dart';
import '../services/api_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/language_selector.dart';

class ChatAssistantScreen extends StatefulWidget {
  const ChatAssistantScreen({
    required this.api,
    required this.onOpenGuide,
    super.key,
  });

  final ApiService api;
  final VoidCallback onOpenGuide;

  @override
  State<ChatAssistantScreen> createState() => _ChatAssistantScreenState();
}

class _ChatEntry {
  const _ChatEntry({
    required this.text,
    required this.isUser,
    this.source,
    this.failed = false,
    this.failedQuestion,
  });

  final String text;
  final bool isUser;
  final String? source;
  final bool failed;
  final String? failedQuestion;
}

class _ChatAssistantScreenState extends State<ChatAssistantScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final List<_ChatEntry> _messages = [];
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send([String? suggestedMessage]) async {
    final responseLanguage = Localizations.localeOf(context).languageCode;
    final message = (suggestedMessage ?? _controller.text).trim();
    if (message.isEmpty || _sending) return;
    setState(() {
      _messages.add(_ChatEntry(text: message, isUser: true));
      _controller.clear();
      _sending = true;
    });
    _scrollToBottom();
    try {
      final reply = await widget.api.sendChatMessage(
        message: message,
        language: responseLanguage,
      );
      if (!mounted) return;
      setState(
        () => _messages.add(
          _ChatEntry(text: reply.reply, isUser: false, source: reply.source),
        ),
      );
    } on ApiException {
      if (!mounted) return;
      setState(
        () => _messages.add(
          _ChatEntry(
            text: AppLocalizations.of(context).assistantUnavailable,
            isUser: false,
            failed: true,
            failedQuestion: message,
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _sending = false);
        _scrollToBottom();
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final currentLanguage = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.emergencyAssistant),
        actions: [
          IconButton(
            onPressed: widget.onOpenGuide,
            tooltip: l10n.offlineGuide,
            icon: const Icon(Icons.menu_book_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: DemoDataNotice(text: l10n.assistantSafetyNotice),
          ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Text(
              '${l10n.assistantResponseLanguage(languageName(l10n, currentLanguage))}\n${l10n.assistantUserTextNotice}',
              textAlign: TextAlign.center,
            ),
          ),
          Expanded(
            child: _messages.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      EmptyPanel(
                        icon: Icons.chat_outlined,
                        message: l10n.assistantEmpty,
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _suggestionChip(l10n.assistantQuestionEvacuation),
                          _suggestionChip(l10n.assistantQuestionFloodwater),
                          _suggestionChip(l10n.assistantQuestionSupplies),
                        ],
                      ),
                    ],
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(12),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final entry = _messages[index];
                      final color = entry.isUser
                          ? Colors.teal.shade100
                          : entry.failed
                          ? Colors.orange.shade50
                          : Colors.white;
                      return Align(
                        alignment: entry.isUser
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: ConstrainedBox(
                          constraints: BoxConstraints(
                            maxWidth: MediaQuery.sizeOf(context).width * 0.84,
                          ),
                          child: Card(
                            color: color,
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  SelectableText(entry.text),
                                  if (entry.source != null) ...[
                                    const SizedBox(height: 6),
                                    Text(
                                      l10n.assistantSourceUnverified(
                                        entry.source!,
                                      ),
                                      style: const TextStyle(
                                        fontSize: 10,
                                        color: Colors.black54,
                                      ),
                                    ),
                                  ],
                                  if (entry.failedQuestion != null)
                                    TextButton.icon(
                                      onPressed: _sending
                                          ? null
                                          : () => _send(entry.failedQuestion),
                                      icon: const Icon(Icons.refresh),
                                      label: Text(l10n.retry),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      enabled: !_sending,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: l10n.askFloodSafety,
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send),
                    tooltip: l10n.sendMessage,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _suggestionChip(String question) => ActionChip(
    label: Text(question),
    onPressed: _sending ? null : () => _send(question),
  );
}
