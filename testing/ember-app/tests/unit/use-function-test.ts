import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { setComponentTemplate } from '@ember/component';
import { destroy } from '@ember/destroyable';
import { click, render, settled } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { module, test } from 'qunit';
import { setupRenderingTest, setupTest } from 'ember-qunit';

import { timeout } from 'ember-concurrency';
import { useFunction } from 'ember-resources';

module('useFunction', function () {
  module('in js', function (hooks) {
    setupTest(hooks);

    test('lifecycle', async function (assert) {
      let runCount = 0;

      class Test {
        @tracked count = 1;

        data = useFunction(
          this,
          async () => {
            runCount++;
            // Pretend we're doing async work
            await Promise.resolve();

            assert.step(`run ${runCount}`);
          },
          () => [this.count]
        );
      }

      let foo = new Test();

      assert.strictEqual(foo.data.value, undefined);

      foo.data.value;
      await settled();
      foo.count = 2;
      foo.data.value;
      await settled();
      foo.count = 6;
      foo.data.value;
      destroy(foo); // this prevents a third run
      await settled();

      assert.verifySteps(['run 1', 'run 2']);
    });

    test('it works with sync functions', async function (assert) {
      class Test {
        @tracked count = 1;

        data = useFunction(
          this,
          (previous: number, count: number) => {
            return count * (previous || 1);
          },
          () => [this.count]
        );
      }

      let foo = new Test();

      assert.strictEqual(foo.data.value, undefined);
      await settled();

      assert.strictEqual(foo.data.value, 1);

      foo.count = 2;
      foo.data.value;
      await settled();

      assert.strictEqual(foo.data.value, 2);

      foo.count = 6;
      foo.data.value;
      await settled();

      assert.strictEqual(foo.data.value, 12);

      foo.count = 7;
      foo.data.value;
      await settled();

      assert.strictEqual(foo.data.value, 84);
    });

    test('it works with async functions', async function (assert) {
      class Test {
        @tracked count = 1;

        data = useFunction(
          this,
          async (previous: undefined | number, count: number) => {
            // Pretend we're doing async work
            await Promise.resolve();

            return count * (previous || 1);
          },
          () => [this.count]
        );
      }

      let foo = new Test();

      assert.strictEqual(foo.data.value, undefined);

      foo.data.value;
      await settled();
      assert.strictEqual(foo.data.value, 1);

      foo.count = 2;
      foo.data.value;
      await settled();

      assert.strictEqual(foo.data.value, 2);

      foo.count = 6;
      foo.data.value;
      await settled();

      assert.strictEqual(foo.data.value, 12);
    });

    test('async functions can have a fallback/initial value', async function (assert) {
      let initialValue = -Infinity;

      class Test {
        @tracked count = 1;

        data = useFunction(
          this,
          initialValue,
          async (previous: undefined | number, count: number) => {
            // Pretend we're doing async work
            await Promise.resolve();

            return count * (previous || 1);
          },
          () => [this.count]
        );
      }

      let foo = new Test();

      assert.strictEqual(foo.data.value, initialValue);

      foo.data.value;
      await settled();
      assert.strictEqual(foo.data.value, 1);

      foo.count = 2;
      foo.data.value;
      await settled();

      assert.strictEqual(foo.data.value, 2);
    });
  });

  module('in templates', function (hooks) {
    setupRenderingTest(hooks);

    test('it works', async function (assert) {
      class Test extends Component {
        @tracked count = 1;

        data = useFunction(
          this,
          (previous: number | undefined, count: number) => {
            return (previous || 1) * count;
          },
          () => [this.count]
        );
        increment = () => this.count++;
      }

      const TestComponent = setComponentTemplate(
        hbs`
            <out>{{this.data.value}}</out>
            <button type='button' {{on 'click' this.increment}}></button>`,
        Test
      );

      this.setProperties({ TestComponent });

      await render(hbs`<this.TestComponent />`);

      assert.dom('out').hasText('1');

      await click('button');

      assert.dom('out').hasText('2');
    });

    test('async functions update when the promise resolves', async function (assert) {
      class Test extends Component {
        @tracked multiplier = 1;

        increment = () => this.multiplier++;

        data = useFunction(
          this,
          async (_, multiplier) => {
            // tracked data consumed here directly does not entangle with the function (deliberately)
            // let { multiplier } = this;

            await new Promise((resolve) => setTimeout(resolve, 50));

            return 2 * multiplier;
          },
          () => [this.multiplier]
        );
      }

      const TestComponent = setComponentTemplate(
        hbs`
            <out>{{this.data.value}}</out>
            <button type='button' {{on 'click' this.increment}}></button>
          `,
        Test
      );

      this.setProperties({ TestComponent });

      render(hbs`<this.TestComponent />`);

      await timeout(25);
      assert.dom('out').hasText('');

      await settled();
      // await timeout(30);
      // debugger;
      assert.dom('out').hasText('2');

      click('button');
      await timeout(25);
      assert.dom('out').hasText('2');

      await settled();
      // await timeout(30);
      assert.dom('out').hasText('4');
    });

    test('it works without a thunk', async function (assert) {
      class Test extends Component {
        @tracked count = 1;

        doubled = useFunction(this, () => this.count * 2);
        increment = () => this.count++;
      }

      const TestComponent = setComponentTemplate(
        hbs`
            <out>{{this.doubled.value}}</out>
            <button type='button' {{on 'click' this.increment}}></button>`,
        Test
      );

      this.setProperties({ TestComponent });

      await render(hbs`<this.TestComponent />`);

      assert.dom('out').hasText('2');

      await click('button');

      // NOTE: this may be unintuitive because of the direct access to this.count.
      //       It's important to know that the function is invoked async, so there is no way to
      //       know that this.count should cause re-invocations without the thunk
      assert.dom('out').hasText('2');
    });
  });
});
