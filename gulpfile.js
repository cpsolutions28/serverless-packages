'use strict';

const gulp = require('gulp');
const path = require('path');
const glob = require('glob');
const stubby = require('gulp-stubby-server');

const merge = require('merge2');
const ts = require('gulp-typescript');
const exec = require('child_process').exec;
const del = require('del');
const tslint = require('gulp-tslint');
const runSequence = require('run-sequence').use(gulp);
const execa = require('execa');
const loadJsonFile = require('load-json-file');

let rootPkg = require('./package.json');
let targetProject = 'account-activity';

const tsProject = ts.createProject('tsconfig.json', {
    typescript: require('typescript'),
    declaration: true,
});

const typescriptSources = glob
    .sync('./packages/**/*.ts')
    .filter(nodeModulesPaths)
    .filter(dirPath => dirPath.indexOf('.d.ts') === -1);
const sourceDistDirectories = glob.sync('./packages/src/*/*/').map(dir => path.resolve(dir + 'dist'));
const sourceDistTsConfig = sourceDistDirectories.map(dir => path.join(dir, 'tsconfig.json'));

const packageJSONsPaths = glob.sync('packages/*/**/package.json', { ignore: '**/node_modules/**' });
const fullPackagePath = packageJSONsPaths.map(pkgPath => path.parse(path.resolve(pkgPath)).dir);
const packagePaths = packageJSONsPaths.map(pkgPath => path.parse(pkgPath).dir);
const packageNodeModulePaths = packagePaths.map(pkgPath => path.join(pkgPath, 'node_modules'));

const accountActivityNodeModulePaths = glob
    .sync('packages/account-activity/*/node_modules', { ignore: packageNodeModulePaths })
    .concat(
        glob
            .sync('packages/account-activity/*/*/node_modules', { ignore: packageNodeModulePaths })
            .concat(glob.sync('packages/account-activity/*/*/*/node_modules', { ignore: packageNodeModulePaths })),
    );

const buildTargetsAccountActivity = [
    'clean-account-activity',
    'tslint',
    'ts',
    //'dist:move',
    // 'dist:move:tsconfig',
    // 'ngc:build', AOT is disabled for now, as Angular recommends against shipping ngfactory files in
    // packages
    //'rollup'
];

function nodeModulesPaths(dirPath) {
    return dirPath.indexOf('node_modules') === -1;
}

function normaliseName(name) {
    return name.replace('@', '').replace(new RegExp(/[\/-]/, 'g'), '_');
}

gulp.task('tslint', () => {
    return gulp
        .src(typescriptSources)
        .pipe(
            tslint({
                formatter: 'stylish',
            }),
        )
        .pipe(tslint.report({ summarizeFailureOutput: true }));
});

gulp.task('ts', () => {
    let failed = false;
    const result = gulp
        .src(typescriptSources)
        .pipe(tsProject(ts.reporter.fullReporter(false)))
        .on('error', () => {
            failed = true;
        })
        .on('finish', () => failed && process.exit(1));

    return merge([result.js.pipe(gulp.dest(distFolder)), result.dts.pipe(gulp.dest(distFolder))]);
});

// clean account activity files
gulp.task('clean-account-activity', done => {
    targetProject = 'account-activity';
    runSequence('clean:generated-' + targetProject + 'files', 'clean:old-' + targetProject + '-node_modules', done);
});

gulp.task('clean:generated-' + targetProject + 'files', () => {
    console.log('Clearing ' + targetProject + ' files');
    return del(
        [
            'packages/' + targetProject + '/*.d.ts',
            'packages/' + targetProject + '/*.js',
            'packages/' + targetProject + '/*.js.map',
        ],
        {
            ignore: ['**/node_modules/**'],
        },
    ).then(logDeletedPaths);
});

gulp.task('clean:generated-' + targetProject + 'files', () => {
    console.log('Clearing dist directories');
    return del(['packages/' + targetProject + '/build'], {
        ignore: ['**/node_modules/**'],
    }).then(logDeletedPaths);
});

// clean account activity modules
gulp.task('clean:old-' + targetProject + '-node_modules', () => {
    switch (targetProject) {
        case 'account-activity': {
            return del(accountActivityNodeModulePaths).then(logDeletedPaths);
            break;
        }
        default: {
            break;
        }
    }
});

function logDeletedPaths(paths) {
    if (paths.length >= 1) {
        const lines = paths.map(deletedPath => `packages/${deletedPath.split('/packages/')[1]}`).join('\n');
        console.log(`Deleted the following:`);
        console.log(`${lines}`);
    } else {
        console.log(`Nothing to delete!`);
    }
}

function distFolder(file) {
    if (file.isDirectory()) {
        return 'packages';
    }
    const originalDir = path.parse(file.path).dir;
    if (isDistDir(originalDir)) {
        return file;
    }
    const fileParts = file.path.split('packages/');
    const parsedPath = path.parse(fileParts[1]);

    let resultPath;

    if (isNestedDirectory(originalDir)) {
        let nestedDir = path.parse(parsedPath.dir);
        resultPath = nestedDir.dir + '/dist/' + nestedDir.name + '/' + parsedPath.base;
    } else {
        resultPath = parsedPath.dir + '/dist/' + parsedPath.base;
    }

    file.base = fileParts[0];
    file.path = path.resolve(resultPath);
    console.log(file.base);
    console.log(file.path);
    return 'packages';

    /**
     * Return true if the file being processed is inside a nested directory
     *
     * eg
     * \package
     *  package.json
     *  file.ts # returns false
     *      \reducers
     *          reducers.ts # returns true
     *
     **/
    function isNestedDirectory(dir) {
        return fullPackagePath.filter(packagePath => packagePath === dir).length === 0;
    }

    function isDistDir(dir) {
        return dir.indexOf('/dist') !== -1;
    }
}

gulp.task('dist:move', () => {
    return gulp.src('packages/src/*/*/!(package).{ts,js,json,map,html}').pipe(gulp.dest(distFolder));
});

gulp.task('dist:move:tsconfig', () => {
    let streams = sourceDistDirectories.map(dir => {
        console.log('Starting move of ' + dir);
        return gulp.src('tsconfig.json').pipe(gulp.dest(dir));
    });
    return merge(streams);
});

gulp.task('build-account-activity', function(done) {
    targetProject = 'account-activity';
    switch (targetProject) {
        case 'account-activity': {
            runSequence(...buildTargetsAccountActivity, done);
            break;
        }
        default: {
            break;
        }
    }
});

gulp.task('build', function(done) {
    runSequence(...buildTargets, done);
});

// Build without running the clean task at the beginning
gulp.task('build:no-clean', function(done) {
    runSequence(...buildTargets.filter(target => target !== 'clean'), done);
});

gulp.task('publish', () => {
    return publishNewVersion({ dryRun: false });
});

gulp.task('publish:dryrun', () => {
    return publishNewVersion();
});

function publishNewVersion(options = { dryRun: true }) {
    return release
        .shouldReleaseChanges()
        .then(shouldRelease => {
            if (shouldRelease) {
                return release.publish(options);
            }
            console.log('Not releasing a new version');
        })
        .catch(err => {
            console.error('Publishing has failed :(', err);
            throw err;
        });
}

gulp.task('gitFetch', () => {
    return release.fetchGitRemote();
});

gulp.task('stubby', function(cb) {
    const options = {
        files: ['mocks/stubby.yaml'],
        watch: 'mocks/stubby.yaml',
        mute: false,
        location: '0.0.0.0',
    };
    stubby(options, cb);
});

gulp.task('link', done => {
    return runSequence('link:commitizen', done);
});

gulp.task('link:commitizen', () => {
    const nodeModules = path.resolve('node_modules');
    console.log('Found node module path - ' + nodeModules);
    return execa('npm', ['link', '@online/store-cz-lib'], { cwd: nodeModules });
});
