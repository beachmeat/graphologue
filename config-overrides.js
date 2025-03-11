const webpack = require('webpack')

module.exports = function override(config, env) {
  // Add babel-loader for modern JavaScript features
  config.module.rules.unshift({
    test: /\.js$/,
    include: [
      /node_modules\/@reactflow/,
      /node_modules\/reactflow/,
      /node_modules\/zustand/,
      /node_modules\/dagre/,
    ],
    loader: 'babel-loader',
    options: {
      presets: ['@babel/preset-env'],
      plugins: [
        '@babel/plugin-transform-optional-chaining',
        '@babel/plugin-transform-nullish-coalescing-operator',
      ],
    },
  })

  // Configure sass-loader to use dart-sass
  const sassRule = config.module.rules.find(
    rule => rule.test && rule.test.toString().includes('scss|sass'),
  )
  if (sassRule) {
    sassRule.use = sassRule.use.map(loader => {
      if (loader.loader && loader.loader.includes('sass-loader')) {
        return {
          ...loader,
          options: {
            implementation: require('sass'),
          },
        }
      }
      return loader
    })
  }

  // Add node configuration
  config.node = {
    process: true,
    Buffer: true,
    __dirname: true,
    __filename: true,
    global: true,
  }

  // Add process polyfill
  config.plugins = [
    ...(config.plugins || []),
    new webpack.DefinePlugin({
      'process.env': JSON.stringify(process.env),
    }),
    new webpack.ProvidePlugin({
      process: 'process',
      Buffer: ['buffer', 'Buffer'],
    }),
  ]

  return config
}
