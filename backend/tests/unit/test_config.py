"""Reading server settings from the environment."""

import unittest

from learning_game_backend.config import ConfigError, GameMasterMode, Settings


class SettingsTests(unittest.TestCase):
    def test_defaults_are_safe(self) -> None:
        settings = Settings.from_env({})
        self.assertIs(settings.game_master_mode, GameMasterMode.DISABLED)
        self.assertEqual(settings.cors_origins, ())
        self.assertTrue(settings.database_path.name.endswith(".sqlite3"))

    def test_environment_values_are_parsed(self) -> None:
        settings = Settings.from_env(
            {
                "GAME_MASTER_MODE": "http",
                "GAME_MASTER_URL": "https://gm.example",
                "GAME_MASTER_API_KEY": "sk-secret",
                "GAME_MASTER_TIMEOUT_SECONDS": "30",
                "LEARNING_GAME_CORS_ORIGINS": "https://a.example, https://b.example",
                "LEARNING_GAME_MAX_UPLOAD_BYTES": "5000",
                "LEARNING_GAME_ALLOW_REGISTRATION": "false",
            }
        )
        self.assertEqual(
            settings.cors_origins, ("https://a.example", "https://b.example")
        )
        self.assertEqual(settings.max_upload_bytes, 5000)
        self.assertFalse(settings.allow_registration)
        self.assertEqual(settings.game_master_timeout_seconds, 30.0)

    def test_the_api_key_is_never_shown_in_reprs(self) -> None:
        settings = Settings.from_env(
            {
                "GAME_MASTER_MODE": "http",
                "GAME_MASTER_URL": "u",
                "GAME_MASTER_API_KEY": "sk-secret",
            }
        )
        self.assertNotIn("sk-secret", repr(settings))

    def test_cors_origins_must_be_exact(self) -> None:
        for bad in (
            "*",
            "https://*.example.com",
            "https://a.example/path",
            "app.example.com",
            "ftp://a.example",
        ):
            with (
                self.subTest(origin=bad),
                self.assertRaisesRegex(ConfigError, "exact origins"),
            ):
                Settings.from_env({"LEARNING_GAME_CORS_ORIGINS": bad})
        with self.assertRaises(ConfigError):
            Settings.from_env({"LEARNING_GAME_CORS_ORIGINS": "https://a.example, *"})
        ok = Settings.from_env(
            {
                "LEARNING_GAME_CORS_ORIGINS": "http://localhost:5173, https://app.example.com"
            }
        )
        self.assertEqual(
            ok.cors_origins, ("http://localhost:5173", "https://app.example.com")
        )

    def test_bad_values_are_reported(self) -> None:
        for env in (
            {"GAME_MASTER_MODE": "magic"},
            {"GAME_MASTER_MODE": "http"},
            {"LEARNING_GAME_MAX_UPLOAD_BYTES": "lots"},
            {"LEARNING_GAME_MAX_UPLOAD_BYTES": "0"},
            {"LEARNING_GAME_ALLOW_REGISTRATION": "maybe"},
        ):
            with self.subTest(env=env), self.assertRaises(ConfigError):
                Settings.from_env(env)


if __name__ == "__main__":
    unittest.main()
