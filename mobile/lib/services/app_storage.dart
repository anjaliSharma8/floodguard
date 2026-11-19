import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/app_models.dart';

class AppStorage {
  AppStorage({FlutterSecureStorage? secureStorage})
    : _secureStorage = secureStorage ?? const FlutterSecureStorage();

  static const _tokenKey = 'sankatsetu_auth_token';
  static const _languageKey = 'sankatsetu_language';
  static const _savedItemsKey = 'sankatsetu_saved_items';

  final FlutterSecureStorage _secureStorage;

  Future<String?> readToken() => _secureStorage.read(key: _tokenKey);

  Future<void> writeToken(String token) =>
      _secureStorage.write(key: _tokenKey, value: token);

  Future<void> clearToken() => _secureStorage.delete(key: _tokenKey);

  Future<String> readLanguage() async {
    final preferences = await SharedPreferences.getInstance();
    final value = preferences.getString(_languageKey);
    return const {'en', 'hi', 'mr'}.contains(value) ? value! : 'en';
  }

  Future<void> writeLanguage(String language) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_languageKey, language);
  }

  Future<List<SavedItem>> readSavedItems() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_savedItemsKey);
    if (raw == null) return [];
    final decoded = jsonDecode(raw);
    if (decoded is! List) {
      throw const FormatException('Saved information must be a list.');
    }
    return decoded.map((item) {
      if (item is! Map) {
        throw const FormatException('A saved item is not an object.');
      }
      return SavedItem.fromJson(Map<String, dynamic>.from(item));
    }).toList();
  }

  Future<void> saveItem(SavedItem item) async {
    final items = await readSavedItems();
    final updated = [
      item,
      ...items.where((existing) => existing.id != item.id),
    ];
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _savedItemsKey,
      jsonEncode(updated.map((saved) => saved.toJson()).toList()),
    );
  }

  Future<void> removeItem(String id) async {
    final items = await readSavedItems();
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _savedItemsKey,
      jsonEncode(
        items
            .where((item) => item.id != id)
            .map((item) => item.toJson())
            .toList(),
      ),
    );
  }
}
