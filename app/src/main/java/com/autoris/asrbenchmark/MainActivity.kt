package com.autoris.asrbenchmark

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.autoris.asrbenchmark.ui.screens.DebugScreen
import com.autoris.asrbenchmark.ui.screens.HistoryScreen
import com.autoris.asrbenchmark.ui.screens.HomeScreen
import com.autoris.asrbenchmark.ui.screens.SettingsScreen
import com.autoris.asrbenchmark.ui.screens.TestSetScreen
import com.autoris.asrbenchmark.ui.theme.AsrBenchmarkTheme
import com.autoris.asrbenchmark.ui.theme.DarkBackground

enum class Screen {
    HOME,
    TEST_SET,
    HISTORY,
    SETTINGS,
    DEBUG,
    NOISE_LAB
}

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    private val requestAudioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            // Permission granted
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on during benchmark sessions to prevent CPU throttling
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Check RECORD_AUDIO permission
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }

        setContent {
            AsrBenchmarkTheme {
                val snackbarHostState = remember { SnackbarHostState() }
                var currentScreen by remember { mutableStateOf(Screen.HOME) }

                Scaffold(
                    snackbarHost = { SnackbarHost(snackbarHostState) },
                    containerColor = com.autoris.asrbenchmark.ui.theme.WarmLinenBg
                ) { innerPadding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                    ) {
                        when (currentScreen) {
                            Screen.HOME -> HomeScreen(
                                viewModel = viewModel,
                                onNavigateToTestSet = { currentScreen = Screen.TEST_SET },
                                onNavigateToHistory = { currentScreen = Screen.HISTORY },
                                onNavigateToSettings = { currentScreen = Screen.SETTINGS },
                                onNavigateToDebug = { currentScreen = Screen.DEBUG },
                                onNavigateToNoiseLab = { currentScreen = Screen.NOISE_LAB }
                            )
                            Screen.TEST_SET -> TestSetScreen(
                                viewModel = viewModel,
                                onNavigateBack = { currentScreen = Screen.HOME }
                            )
                            Screen.HISTORY -> HistoryScreen(
                                viewModel = viewModel,
                                onNavigateBack = { currentScreen = Screen.HOME }
                            )
                            Screen.SETTINGS -> SettingsScreen(
                                viewModel = viewModel,
                                onNavigateBack = { currentScreen = Screen.HOME }
                            )
                            Screen.DEBUG -> DebugScreen(
                                viewModel = viewModel,
                                onNavigateBack = { currentScreen = Screen.HOME }
                            )
                            Screen.NOISE_LAB -> com.autoris.asrbenchmark.ui.screens.NoiseLabScreen(
                                viewModel = viewModel,
                                onNavigateBack = { currentScreen = Screen.HOME }
                            )
                        }
                    }
                }
            }
        }
    }
}
