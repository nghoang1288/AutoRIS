# Keep sherpa-onnx classes and JNI methods
-keep class com.k2fsa.sherpa.onnx.** { *; }
-dontwarn com.k2fsa.sherpa.onnx.**

# Keep models and Gson serialized objects
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keep class com.autoris.asrbenchmark.** { *; }
