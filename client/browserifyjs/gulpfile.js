import gulp from 'gulp';
import source from 'vinyl-source-stream';
import buffer from 'vinyl-buffer';
import browserify from 'browserify';
import babelify from "babelify";
import rename from 'gulp-rename';
import uglify from 'gulp-uglify'

gulp.task('exec', function(){
  return browserify({
    entries: [
      'index.js'
    ]
  })
  .transform(babelify)
  .bundle()
  .pipe(source('index.js'))
  .pipe(rename('bundle.js'))
  .pipe(buffer())
  .pipe(uglify({mangle:{reserved:["serverconnect","$"]}}))
  .pipe(gulp.dest('../frontend/'));
});