package com.autoris.asrbenchmark

import android.app.Application
import android.util.Log

class AsrBenchmarkApp : Application() {

    override fun onCreate() {
        super.onCreate()
        Log.i("AsrBenchmarkApp", "Application started on ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
    }
}
