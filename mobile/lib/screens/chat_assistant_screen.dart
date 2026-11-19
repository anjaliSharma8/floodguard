import 'package:material_ui/material_ui.dart';

import '../services/api_service.dart';
import '../widgets/app_widgets.dart';

class ChatAssistantScreen extends StatefulWidget {
  const ChatAssistantScreen({
    required this.api,
    required this.language,
    super.key,
  });

  final ApiService api;
  final String language;

  @override
  State<ChatAssistantScreen> createState() => _ChatAssistantScreenState();
}

class _ChatEntry {
  const _ChatEntry({
    required this.text,
    required this.isUser,
    this.source,
    this.failed = false,
  });

  final String text;
  final bool isUser;
  final String? source;
  final bool failed;
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

  Future<void> _send() async {
    final message = _controller.text.trim();
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
        language: widget.language,
      );
      if (!mounted) return;
      setState(
        () => _messages.add(
          _ChatEntry(text: reply.reply, isUser: false, source: reply.source),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(
        () => _messages.add(
          _ChatEntry(
            text:
                'The assistant service is unavailable (${error.message}). Use the offline emergency guide for basic safety steps. For immediate danger, contact local emergency services directly. No live conditions or route safety can be confirmed here.',
            isUser: false,
            failed: true,
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
    final languageName = switch (widget.language) {
      'hi' => 'Hindi',
      'mr' => 'Marathi',
      _ => 'English',
    };
    return Scaffold(
      appBar: AppBar(title: const Text('Emergency assistant')),
      body: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: DemoDataNotice(
              text: 'Replies come from the backend chatbot and may be incomplete. Do not rely on it for live flood status, facility availability, route safety or emergency dispatch.',
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Text('Response language: $languageName'),
          ),
          Expanded(
            child: _messages.isEmpty
                ? const EmptyPanel(
                    icon: Icons.chat_outlined,
                    message: 'Ask for general app guidance or flood-safety information. This assistant does not replace emergency services.',
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
                                      'Service-reported source (not independently verified): ${entry.source}',
                                      style: const TextStyle(
                                        fontSize: 10,
                                        color: Colors.black54,
                                      ),
                                    ),
                                  ],
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
                      decoration: const InputDecoration(
                        hintText: 'Ask a flood-safety question',
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
                    tooltip: 'Send message',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
