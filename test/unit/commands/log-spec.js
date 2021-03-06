'use strict';
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const Command = require('../../../lib/command');
const Errors = require('../../../lib/errors');

const modulePath = '../../../lib/commands/log';

const psModule = 'ghost-ignition/lib/logging/PrettyStream';

function proxyLog(proxyOptions) {
    let Log;

    if (!proxyOptions) {
        Log = require(modulePath);
    } else {
        Log = proxyquire(modulePath, proxyOptions);
    }
    return new Log();
}

function configGet(what) {
    if (what === 'url') {
        return 'https://dev.ghost.org'
    } else if (what === 'logging.transports') {
        return ['file'];
    }

    return undefined;
}

const defaultInstance = {
    running: () => true,
    loadRunningEnvironment: () => true,
    config: {get: configGet},
    dir: '/var/www/ghost'
};
const defaultSystem = {
    getInstance: () => defaultInstance,
    environment: 'dev'
};

describe('Unit: Commands > Log', function () {
    let ext, stubs;

    beforeEach(function () {
        stubs = {
            es: sinon.stub(),
            // thrown to stop execution
            cvi: sinon.stub().throws(new Error())
        }
    });

    describe('run', function () {
        it('Checks installation if name isn\'t provided', function () {
            class FakeCommand extends Command {}
            FakeCommand.checkValidInstall = stubs.cvi;
            ext = proxyLog({'../command': FakeCommand});
            try {
                ext.run({});
            } catch (error) {
                expect(error).to.be.ok;
                expect(stubs.cvi.calledOnce).to.be.true;
                expect(stubs.cvi.getCall(0).args[0]).to.equal('log');
            }
        });

        it('Fails if instance doesn\'t exist', function () {
            const ext = proxyLog();
            stubs.gi = sinon.stub().returns(false);
            ext.system = {getInstance: stubs.gi};

            return ext.run({name: 'ghost_org'}).then(() => {
                expect(false, 'Promise should have rejected').to.be.true;
            }).catch((error) => {
                expect(error).to.be.ok;
                expect(error).to.be.instanceOf(Errors.SystemError);
                expect(stubs.gi.calledOnce).to.be.true;
                expect(stubs.gi.getCall(0).args[0]).to.equal('ghost_org');
            });
        });

        it('Loads the proper environment (running)', function () {
            // These errors are thrown to stop execution
            stubs.lre = sinon.stub().throws(new Error('lre'));
            stubs.running = sinon.stub().returns(true);
            const ext = proxyLog();
            const instance = {
                running: stubs.running,
                loadRunningEnvironment: stubs.lre
            };
            stubs.gi = sinon.stub().returns(instance);
            ext.system = {getInstance: stubs.gi};

            try {
                ext.run({name: 'ghost_org'});
                expect(false, 'An error should have been thrown').to.be.true;
            } catch (error) {
                expect(error).to.be.ok;
                expect(error.message).to.equal('lre');
                expect(stubs.running.calledOnce).to.be.true;
                expect(stubs.lre.calledOnce).to.be.true;
            }
        });

        it('Loads the proper environment (not running)', function () {
            // These errors are thrown to stop execution
            stubs.ce = sinon.stub().throws(new Error('ce'));
            stubs.running = sinon.stub().returns(false);
            const ext = proxyLog();
            const instance = {
                running: stubs.running,
                checkEnvironment: stubs.ce
            };
            stubs.gi = sinon.stub().returns(instance);
            ext.system = {getInstance: stubs.gi};

            try {
                ext.run({name: 'ghost_org'});
                expect(false, 'An error should have been thrown').to.be.true;
            } catch (error) {
                expect(error).to.be.ok;
                expect(error.message).to.equal('ce');
                expect(stubs.running.calledOnce).to.be.true;
                expect(stubs.ce.calledOnce).to.be.true;
            }
        });

        it('Rejects when logging to file is disabled', function () {
            const ext = proxyLog();
            const instance = {
                running: () => true,
                loadRunningEnvironment: () => true,
                config: {get: () => ['a', 'b', 'c']}
            };
            ext.system = {getInstance: () => instance};

            return ext.run({name: 'ghost_org'}).then(() => {
                expect(false, 'An error should have been thrown').to.be.true;
            }).catch((error) => {
                expect(error).to.be.ok;
                expect(error).to.be.instanceOf(Errors.ConfigError);
            });
        });

        it('Resolves when log file doesn\'t exist', function () {
            stubs.es.returns(false);
            const ext = proxyLog({fs: {existsSync: stubs.es}});
            ext.system = defaultSystem;

            return ext.run({name: 'ghost_org'}).then(() => {
                expect(stubs.es.calledOnce).to.be.true;
            });
        });

        it('Warns when following nonexistant file', function () {
            stubs.es.returns(false);
            stubs.log = sinon.stub();
            const ext = proxyLog({fs: {existsSync: stubs.es}});
            ext.system = defaultSystem;
            ext.ui = {log: stubs.log}

            return ext.run({name: 'ghost_org', follow: true}).then(() => {
                expect(stubs.es.calledOnce).to.be.true;
                expect(stubs.log.calledOnce).to.be.true;
                expect(stubs.log.getCall(0).args[0]).to.match(/not been created yet/);
            });
        });

        it('Passes unknown PrettyStream errors through', function () {
            class PrettyStream {}
            PrettyStream.prototype.on = sinon.stub().callsFake((event, callback) =>{
                expect(event).to.equal('error');
                callback(new Error('test error'));
            });
            const ext = proxyLog({
                fs: {existsSync: () => true},
                [psModule]: PrettyStream
            });
            ext.system = defaultSystem;

            try {
                ext.run({name: 'ghost_org'});
                expect(false, 'An error should have been thrown').to.be.true;
            } catch (error) {
                expect(error).to.be.ok;
                expect(error.message).to.equal('test error');
            }
        });

        it('Ignores PrettyStream syntax errors', function () {
            class PrettyStream {}
            PrettyStream.prototype.on = sinon.stub().callsFake((event, callback) =>{
                expect(event).to.equal('error');
                callback(new SyntaxError('bad error'));
                throw new Error('break the code');
            });
            const ext = proxyLog({
                fs: {existsSync: () => true},
                [psModule]: PrettyStream
            });
            ext.system = defaultSystem;

            try {
                ext.run({name: 'ghost_org'});
                expect(false, 'An error should have been thrown').to.be.true;
            } catch (error) {
                expect(error).to.be.ok;
                expect(error.message).to.equal('break the code');
            }
        });

        it('Writes by line', function () {
            class PrettyStream {
                pipe() {}
                on() {}
            }
            stubs.write = sinon.stub();
            stubs.ll = sinon.stub().resolves('    a  cat\n in the hat ate\n bananas  ');
            PrettyStream.prototype.write = stubs.write;
            const ext = proxyLog({
                fs: {existsSync: () => true},
                [psModule]: PrettyStream,
                'read-last-lines': {read: stubs.ll}
            });
            const instance = {
                running: () => true,
                loadRunningEnvironment: () => true,
                config: {get: sinon.stub().callsFake(configGet)},
                dir: '/var/www/ghost'
            };
            ext.system = {getInstance: () => instance, environment: 'dev'};
            ext.ui = {stdout: true};
            return ext.run({name: 'ghost_org'}).then(() => {
                expect(stubs.ll.calledOnce).to.be.true;
                expect(stubs.write.calledThrice).to.be.true;
                expect(stubs.write.getCall(0).args[0]).to.equal('a  cat');
                expect(stubs.write.getCall(1).args[0]).to.equal(' in the hat ate');
                expect(stubs.write.getCall(2).args[0]).to.equal(' bananas');
            });
        });

        it('Follows if requested', function () {
            class PrettyStream {
                pipe() {}
                on() {}
            }
            class Tail {}
            stubs.write = sinon.stub();
            stubs.tail = sinon.stub().callsFake((event, cb) => {
                expect(event).to.equal('line');
                cb('cherry');
                cb('Mango');
            });
            PrettyStream.prototype.write = stubs.write;
            Tail.prototype.on = stubs.tail;
            const ext = proxyLog({
                fs: {existsSync: () => true},
                [psModule]: PrettyStream,
                'read-last-lines': {read: () => Promise.resolve('')},
                tail: {Tail: Tail}
            });
            ext.system = defaultSystem;
            ext.ui = {stdout: true};
            return ext.run({name: 'ghost_org', follow: true}).then(() => {
                expect(stubs.write.calledThrice).to.be.true;
                expect(stubs.write.getCall(1).args[0]).to.equal('cherry');
                expect(stubs.write.getCall(1).args[1]).to.equal('utf8');
                expect(stubs.write.getCall(2).args[0]).to.equal('Mango');
                expect(stubs.write.getCall(2).args[1]).to.equal('utf8');
            });
        });
    });
});
