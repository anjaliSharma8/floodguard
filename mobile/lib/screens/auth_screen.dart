import 'package:material_ui/material_ui.dart';

import '../models/app_models.dart';
import '../l10n/generated/app_localizations.dart';
import '../services/api_service.dart';
import '../widgets/language_selector.dart';

enum AuthScreenMode { welcome, login, register }

class AuthScreen extends StatefulWidget {
  const AuthScreen({
    required this.api,
    required this.language,
    required this.onLanguageChanged,
    required this.onAuthenticated,
    this.onContinueAsGuest,
    this.initialMode = AuthScreenMode.welcome,
    super.key,
  });

  final ApiService api;
  final String language;
  final ValueChanged<String> onLanguageChanged;
  final Future<void> Function(AuthSession) onAuthenticated;
  final Future<void> Function()? onContinueAsGuest;
  final AuthScreenMode initialMode;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _phoneController = TextEditingController();
  late AuthScreenMode _mode;
  bool _busy = false;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  String? _error;

  bool get _register => _mode == AuthScreenMode.register;

  @override
  void initState() {
    super.initState();
    _mode = widget.initialMode;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = _register
          ? await widget.api.registerCitizen(
              fullName: _nameController.text.trim(),
              email: _emailController.text.trim(),
              password: _passwordController.text,
              phone: _phoneController.text.trim(),
              language: widget.language,
            )
          : await widget.api.loginCitizen(
              _emailController.text.trim(),
              _passwordController.text,
            );
      if (!mounted) return;
      await widget.onAuthenticated(session);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(
        () => _error = error.localizedMessage(AppLocalizations.of(context)),
      );
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() => _error = 'Could not save your sign-in securely: $error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _validateEmail(String? value) {
    final l10n = AppLocalizations.of(context);
    final email = value?.trim() ?? '';
    if (email.isEmpty) return l10n.enterEmail;
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      return l10n.validEmail;
    }
    return null;
  }

  String? _validatePassword(String? value) {
    final l10n = AppLocalizations.of(context);
    if (value == null || value.isEmpty) return l10n.enterPassword;
    if (_register && value.length < 6) {
      return l10n.passwordMinLength;
    }
    return null;
  }

  InputDecoration _decoration(String label, {Widget? suffixIcon}) =>
      InputDecoration(
        labelText: label,
        suffixIcon: suffixIcon,
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.teal.shade100),
        ),
      );

  Widget _buildWelcome() {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          l10n.welcomeTitle,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Color(0xFF075E66),
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          l10n.welcomeDescription,
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.blueGrey.shade700),
        ),
        const SizedBox(height: 28),
        if (widget.onContinueAsGuest != null) ...[
          SizedBox(
            height: 58,
            child: FilledButton.icon(
              key: const ValueKey('continue-as-guest'),
              onPressed: _busy
                  ? null
                  : () {
                      widget.onContinueAsGuest?.call();
                    },
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF087E8B),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              icon: const Icon(Icons.emergency_outlined),
              label: Text(
                l10n.continueAsGuest,
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              ),
            ),
          ),
          const SizedBox(height: 14),
        ],
        SizedBox(
          height: 52,
          child: OutlinedButton(
            onPressed: _busy
                ? null
                : () => setState(() {
                    _mode = AuthScreenMode.login;
                    _error = null;
                  }),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF075E66),
              side: const BorderSide(color: Color(0xFF087E8B)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: Text(l10n.login),
          ),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _busy
              ? null
              : () => setState(() {
                  _mode = AuthScreenMode.register;
                  _error = null;
                }),
          child: Text(l10n.createAccount),
        ),
      ],
    );
  }

  Widget _buildAuthForm() {
    final l10n = AppLocalizations.of(context);
    final isRegistering = _register;
    return Column(
      children: [
        Text(
          isRegistering ? l10n.createYourAccount : l10n.welcomeTitle,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Color(0xFF075E66),
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          isRegistering ? l10n.signUpDescription : l10n.signInDescription,
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.blueGrey.shade700),
        ),
        const SizedBox(height: 24),
        Card(
          elevation: 1,
          color: const Color(0xFFFCFEFE),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: AutofillGroup(
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (isRegistering) ...[
                      TextFormField(
                        controller: _nameController,
                        textCapitalization: TextCapitalization.words,
                        autofillHints: const [AutofillHints.name],
                        readOnly: _busy,
                        decoration: _decoration(l10n.fullName),
                        validator: (value) =>
                            value == null || value.trim().isEmpty
                            ? l10n.enterFullName
                            : null,
                      ),
                      const SizedBox(height: 14),
                    ],
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      readOnly: _busy,
                      decoration: _decoration(l10n.email),
                      validator: _validateEmail,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      autofillHints: [
                        isRegistering
                            ? AutofillHints.newPassword
                            : AutofillHints.password,
                      ],
                      textInputAction: isRegistering
                          ? TextInputAction.next
                          : TextInputAction.done,
                      readOnly: _busy,
                      onFieldSubmitted: (_) {
                        if (!isRegistering && !_busy) _submit();
                      },
                      decoration: _decoration(
                        l10n.password,
                        suffixIcon: IconButton(
                          tooltip: _obscurePassword
                              ? l10n.showPassword
                              : l10n.hidePassword,
                          onPressed: _busy
                              ? null
                              : () => setState(
                                  () => _obscurePassword = !_obscurePassword,
                                ),
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      validator: _validatePassword,
                    ),
                    if (isRegistering) ...[
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _confirmPasswordController,
                        obscureText: _obscureConfirmPassword,
                        autofillHints: const [AutofillHints.newPassword],
                        textInputAction: TextInputAction.next,
                        readOnly: _busy,
                        decoration: _decoration(
                          l10n.confirmPassword,
                          suffixIcon: IconButton(
                            tooltip: _obscureConfirmPassword
                                ? l10n.showConfirmPassword
                                : l10n.hideConfirmPassword,
                            onPressed: _busy
                                ? null
                                : () => setState(
                                    () => _obscureConfirmPassword =
                                        !_obscureConfirmPassword,
                                  ),
                            icon: Icon(
                              _obscureConfirmPassword
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                          ),
                        ),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return l10n.confirmYourPassword;
                          }
                          if (value != _passwordController.text) {
                            return l10n.passwordsMismatch;
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        autofillHints: const [AutofillHints.telephoneNumber],
                        textInputAction: TextInputAction.done,
                        readOnly: _busy,
                        decoration: _decoration(l10n.phoneOptional),
                      ),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _error!,
                          style: TextStyle(color: Colors.red.shade900),
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    SizedBox(
                      height: 52,
                      child: FilledButton(
                        onPressed: _busy ? null : _submit,
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF087E8B),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: _busy
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2,
                                ),
                              )
                            : Text(
                                isRegistering ? l10n.signUp : l10n.login,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                              _mode = isRegistering
                                  ? AuthScreenMode.login
                                  : AuthScreenMode.register;
                              _error = null;
                              _formKey.currentState?.reset();
                            }),
                      child: Text(
                        isRegistering ? l10n.alreadyHaveAccount : l10n.newToApp,
                        style: const TextStyle(
                          color: Color(0xFF075E66),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (widget.onContinueAsGuest != null)
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => setState(
                                () => _mode = AuthScreenMode.welcome,
                              ),
                        child: Text(l10n.backToWelcome),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F8F8),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
              children: [
                Image.asset(
                  'assets/sankatsetu_logo.png',
                  height: 100,
                  fit: BoxFit.contain,
                  semanticLabel: 'SankatSetu logo',
                ),
                const SizedBox(height: 18),
                if (_mode == AuthScreenMode.welcome) ...[
                  LanguageSelector(
                    value: widget.language,
                    onChanged: widget.onLanguageChanged,
                    compact: true,
                  ),
                  const SizedBox(height: 18),
                ],
                if (_mode == AuthScreenMode.welcome)
                  _buildWelcome()
                else
                  _buildAuthForm(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
